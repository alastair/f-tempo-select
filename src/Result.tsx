import React, {Component} from "react";
import {NgramResult} from "./ResultList";
import {SVG} from "@svgdotjs/svg.js"

interface ResultProps {
    result: NgramResult;
}

interface ResultState {
    verovioTk: any;
    renderedScore?: string;
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
    constructor(props: Readonly<ResultProps>) {
        super(props);
        this.state = {
            verovioTk: new window.verovio.toolkit(),
        }
    }

    loadVerovio = () => {
        fetch("https://uk-dev-ftempo.rism.digital/img/mei/" + this.props.result.match_id + '.mei').then(r => r.text()).then(meiXML => {
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
                for (const match of this.props.result.notes) {
                    const elements = [];
                    for (const note of match) {
                        elements.push(document.getElementById(note.id));
                    }

                    const boundingBoxes = this.boundingBoxesForElements(elements);

                    for (const bb of Object.values(boundingBoxes)) {
                        const rect = SVG().addTo('#m_svg_output svg');
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
    boundingBoxesForElements = (elements: any): SystemBox => {
        const systems: any = {};
        if(!elements.length) return systems;

        for (const element of elements) {
            const elementStaff = element.closest('.staff');
            const staffLines = elementStaff.getElementsByTagName('path');
            const elTop = this.convertScale(staffLines[0]).y;
            const elBot = this.convertScale(staffLines[staffLines.length-1]).y;

            const system = element.closest('.system').id;
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
                <div style={{width: '500px'}} id={"m_svg_output"} className="score"
                     dangerouslySetInnerHTML={{__html: this.state.renderedScore}} />}
        <img alt={"some score"} width="500" src={"https://uk-dev-ftempo.rism.digital/img/jpg/" + this.props.result.match_id + '.jpg'} onLoad={this.loadVerovio} /></div>
    }
}