import React, {Component} from "react";
import {NgramResult} from "./ResultList";
import {SVG} from "@svgdotjs/svg.js"

interface ResultProps {
    result: NgramResult;
}

interface ResultState {
    verovioTk: any;
    renderedScore?: string;
    imageFailed?: boolean;
}

interface BBox {
    top: number
    bottom: number
    left: number
    right: number
}

interface SystemBox {
    [systemId: string]: BBox
}

export default class Result extends Component<ResultProps, ResultState> {
    private scoreRef = React.createRef<HTMLDivElement>();
    private unmounted = false;

    componentDidMount() {
        this.unmounted = false;
    }

    componentWillUnmount() {
        this.unmounted = true;
    }

    constructor(props: Readonly<ResultProps>) {
        super(props);
        this.state = {
            verovioTk: new window.verovio.toolkit(),
        }
    }

    loadVerovio = () => {
        fetch('/api/get_mei?id=' + encodeURIComponent(this.props.result.match_id)).then(r => r.text()).then(meiXML => {
            if (this.unmounted || this.state.imageFailed) return;
            const options = {
                footer: "none",
                shrinkToFit: true,
                svgViewBox: true
            };
            this.state.verovioTk.setOptions(options);
            let svg = this.state.verovioTk.renderData(meiXML, {});
            this.setState({
                renderedScore: svg
            }, () => {
                // By this stage we've rendered the svg and it's in the DOM, so we can manipulate it
                // TODO: This is super dodgy because we're editing the SVG in the dom after React has rendered it :(
                const resultSvg = this.scoreRef.current?.querySelector('svg');
                if (!resultSvg) return;

                const notesById = new Map(
                    Array.from(resultSvg.querySelectorAll('.note[id]')).map(element => [element.id, element])
                );
                for (const match of this.props.result.notes) {
                    const elements: Element[] = [];
                    for (const note of match) {
                        const element = notesById.get(note.id);
                        // Matches may include notes on a page that isn't rendered.
                        if (element) elements.push(element);
                    }

                    const boundingBoxes = this.boundingBoxesForElements(elements);

                    for (const bb of Object.values(boundingBoxes)) {
                        const rect = SVG().addTo(SVG(resultSvg));
                        rect.rect(bb.right - bb.left, bb.bottom - bb.top);
                        rect.move(bb.left, bb.top);
                        rect.attr({'fill-opacity': 0.3, 'stroke': "orange"});
                    }
                }
            });
        });
    }

    convertScale = (elem: any) => {
        const rect = elem.getBoundingClientRect()
        const mainSvg = elem.closest("svg").parentElement
        const topleft = mainSvg.createSVGPoint()
        topleft.x = rect.left
        topleft.y = rect.top
        const bottomright = mainSvg.createSVGPoint()
        bottomright.x = rect.right
        bottomright.y = rect.bottom
        const topleftT = topleft.matrixTransform(mainSvg.getScreenCTM().inverse())
        const bottomrightT = bottomright.matrixTransform(mainSvg.getScreenCTM().inverse())

        return {
            x: topleftT.x,
            y: topleftT.y,
            width: bottomrightT.x - topleftT.x,
            height: bottomright.y - topleftT.y,
            right: bottomrightT.x,
            bottom: bottomrightT.y
        };
    }

    /**
     * Find the bounding box(es) for a list of elements in an SVG rendered score.
     * The elements should be contiguous, but may cover more than one system.
     *
     * The left boundary of the system is that of the left-most element for that system
     * and the right boundary is that of the right-most element.
     * The top and bottom are bounded by the first and last staffline.
     *
     * The bounding boxes will be scaled to be able to be drawn directly on the
     * canvas that the elements are part of.
     * @param elements
     * @return an object of bounding boxes for each system
     */
    boundingBoxesForElements = (elements: Element[]): SystemBox => {
        const systems: SystemBox = {};
        if(!elements.length) return systems;

        for (const element of elements) {
            const elementStaff = element.closest('.staff');
            const elementSystem = element.closest('.system');
            if (!elementStaff || !elementSystem) continue;

            const staffLines = elementStaff.getElementsByTagName('path');
            if (!staffLines.length) continue;
            const elTop = this.convertScale(staffLines[0]).y;
            const elBot = this.convertScale(staffLines[staffLines.length-1]).y;

            const system = elementSystem.id;
            if (systems[system]) {
                systems[system].left = Math.min(this.convertScale(element).x, systems[system].left);
                systems[system].right = Math.max(this.convertScale(element).right, systems[system].right);
            } else {
                systems[system] = {
                    top: elTop,
                    bottom: elBot,
                    left: this.convertScale(element).x,
                    right: this.convertScale(element).right
                };
            }
        }
        return systems;
    }


    render = () => {
        return <div>{this.props.result.match_id}<br/>{this.state.renderedScore &&
                <div ref={this.scoreRef} style={{width: '500px'}} id={"m_svg_output"} className="score"
                     dangerouslySetInnerHTML={{__html: this.state.renderedScore}} />}
        {this.state.imageFailed ? <p role="alert">Image failed to load</p> :
            <img alt={"some score"} width="500" src={"https://search.f-tempo.org/img/jpg/" + this.props.result.match_id + '.jpg'} onLoad={this.loadVerovio}
                 onError={() => this.setState({imageFailed: true, renderedScore: undefined})} />}</div>
    }
}
