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

/**
 * Scale conversion:
 * Theoretically in SVG you should be able to do something like this:
 *
 * const matrix = elem.getScreenCTM();
 * const svg = elem.closest("svg").parentElement
 * const p = svg.createSVGPoint()
 * p.x=
 * p.y=
 * p.matrixTransform(matrix)
 *  - or p.matrixTransform(matrix.inverse())
 *
 * This is to convert between the DOM scale and the SVG scale. However I can't seem to get it working
 * with a scaling provided by a <svg viewport=""> attribute, and have to resort to adding
 * an additional scale factor with
 *  const viewportScale = mainSvg.getBBox().width / mainSvg.getBoundingClientRect().width;
 *
 * unsure if the matrix can also take care of this, or if there's another bounding box method.
 */

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
                // By this stage we've rendered it
                const elements = [];
                if (this.props.result.notes.length > 0) {
                    for (const note of this.props.result.notes[0]) {
                        elements.push(document.getElementById(note.id));
                    }
                }
                console.debug(elements)
                const boundingBoxes = this.boundingBoxesForElements(elements);
                console.debug(boundingBoxes);

                // TODO: This is super dodgy because we're editing the SVG in the dom after React has rendered it :(
                for (const [system, bb] of Object.entries(boundingBoxes)) {
                    const drawq = SVG().addTo('#m_svg_output svg');
                    drawq.rect(bb.right - bb.left, bb.bottom - bb.top);
                    drawq.move(bb.left, bb.top);
                    drawq.attr({'fill-opacity': 0.3, 'stroke': "orange"});
                }
            });
        });
    }

    convertCoords = (elem: any) => {
        const x = elem.getBBox().x;
        const y = elem.getBBox().y;
        const mainSvg = elem.closest("svg").parentElement
        // Verovio adds a viewport attribute to the main svg, for scaling. We compute values
        // in the scaled (physical) view, but when creating a rect we need the sizes relative
        // to the viewport size
        const viewportScale = mainSvg.getBBox().width / mainSvg.getBoundingClientRect().width;
        const offset = mainSvg.getBoundingClientRect();
        const matrix = elem.getScreenCTM();
        return {
            x: (matrix.a * x * viewportScale) + matrix.e - offset.left,
            y: (matrix.d * y * viewportScale) + matrix.f - offset.top
        };
    }

    cv = (elem: any) => {
        const x = elem.getBBox().x;
        const y = elem.getBBox().y;
        const width = elem.getBBox().width;
        const height = elem.getBBox().height;
        const mainSvg = elem.closest("svg").parentElement
        const viewportScale = mainSvg.getBBox().width / mainSvg.getBoundingClientRect().width;
        const matrix = elem.getScreenCTM();
        return {
            x: (matrix.a * x * viewportScale) + matrix.e,
            y: (matrix.d * y * viewportScale) + matrix.f,
            width: (matrix.a * width),
            height: (matrix.d * height)
        };
    }

    getSystem = (element: any) => {
        const sysObj = element.closest('.system');
        return sysObj.id;
    }

    boundingBoxesForElements = (elements: any): SystemBox => {
        const systems: any = {};
        if(!elements.length) return systems;

        // first get the vert/horiz screen offsets of the entire div into which all SVG is drawn
        const parentBox = elements[0].closest('div').childNodes[0].getBoundingClientRect();
        console.debug(parentBox);
        console.debug(elements[0].closest('div'))
        console.debug(elements[0].closest('div').childNodes[0])
        const offsetY = parentBox.top;
        const offsetX = parentBox.left;

        for (const element of elements){

            // The childNodes here are the top and bottom staff-lines themselves,
            // but y is screen-relative (??), so we add offsetY;
            // the last tweak (+- 8) is to get a reasonable 'margin' around the box
            // first staff line
            const elTop = this.convertCoords(element.closest('.staff').childNodes[1]).y + offsetY - 8;
            // last staff line
            const elBot = this.convertCoords(element.closest('.staff').childNodes[9]).y + offsetY + 8;
            console.log("element")
            console.log(element)

            const elementRect = element.getBoundingClientRect();
            console.log(elementRect)
            const system = this.getSystem(element);
            if(systems[system]) {
                systems[system].top = elTop;
                systems[system].bottom = elBot;
                systems[system].left = (systems[system].left || systems[system].left===0)
                    ? Math.min(this.cv(element).x, systems[system].left) : this.cv(element).x;
                systems[system].right = systems[system].right ? Math.max(this.cv(element).x+this.cv(element).width, systems[system].right)
                    : this.cv(element).x+this.cv(element).width;
            } else {
                systems[system] = {top: elTop, bottom: elBot,
                    left: this.cv(element).x, right: this.cv(element).x+this.cv(element).width};
            }
        }
        for (const s in systems) {
            systems[s].top -= offsetY;
            systems[s].bottom -= offsetY;
            systems[s].left -= offsetX;
            systems[s].right -= offsetX;
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