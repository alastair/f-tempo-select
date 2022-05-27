import React, {useCallback, useEffect, useState} from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import {useParams, useSearchParams} from "react-router-dom";
import {Button, Col, Container, Row} from "react-bootstrap";

/**
 * Parse an MEI file and return an object {staffId: [noteid, noteid, ...]}
 * @param meiContents
 */
function parseMeiParts(meiContents: string) {
    const parser = new DOMParser();
    const document = parser.parseFromString(meiContents, "application/xml");

    const staffs: {[k: string]: string[]} = {};

    const measures = document.getElementsByTagName("measure");
    Array.from(measures).forEach(function(measure) {
        const measureStaffs = measure.getElementsByTagName("staff");
        Array.from(measureStaffs).forEach(function(staff) {
            const measureStaffId = staff.attributes.getNamedItem('n')?.value!
            if (!staffs.hasOwnProperty(measureStaffId)) {
                staffs[measureStaffId] = [];
            }
            const notes = staff.getElementsByTagName("note");
            Array.from(notes).forEach(function(note) {
                const nattrs = note.attributes;
                const id = nattrs.getNamedItem('xml:id')?.value!
                staffs[measureStaffId].push(id);
            });
        });
    });

    return staffs;
}


function Viewer() {

    const [searchParams, setSearchParams] = useSearchParams();
    const [renderedScore, setRenderedScore] = useState(undefined);
    const [staffNotes, setStaffNotes] = useState<{[k: string]: string[]}>({});
    const [error, setError] = useState<string|null>(null);
    const params = useParams();
    const documentId = params.id;
    const staff = searchParams.get('staff');
    const start = searchParams.get('start');
    const count = searchParams.get('count');
    const page = searchParams.get('page');
    const pageInt = page && parseInt(page, 10);

    const newPageParams = useCallback((newPage: number) => {
        return Object.assign(
            {},
            {page: newPage.toString()},
            staff && {staff},
            start && {start},
            count && {count})
    }, [count, staff, start]);

    useEffect(() => {
        // If the page argument is missing or isn't a number, set it to 1
        if (page === null || isNaN(parseInt(page, 10))) {
            setSearchParams(newPageParams(1));
        }
    }, [count, newPageParams, page, setSearchParams, staff, start]);

    useEffect(() => {
        if (!pageInt) {
            return;
        }
        const verovioTk =  new window.verovio.toolkit();
        fetch(`https://solrdev.f-tempo.org/api/get_mei?id=${documentId}`).then(r => r.text()).then(meiXML => {
            const options = {
                footer: "none",
                shrinkToFit: true,
                svgViewBox: true,
            };
            verovioTk.setOptions(options);
            verovioTk.loadData(meiXML, {});
            let svg = verovioTk.renderToSVG(pageInt);
            setRenderedScore(svg);
            setStaffNotes(parseMeiParts(meiXML));
            setError(null);
        });
    }, [documentId, page, pageInt])

    useEffect(() => {
        if (!renderedScore) {
            // If we've not rendered the score yet, just stop.
            return
        }
        if (!staff || !staffNotes.hasOwnProperty(staff)) {
            setError(`staff parameter (${staff}) isn't set or isn't in this score (${Object.keys(staffNotes)})`);
            return;
        }
        const startNumber = start !== null ? parseInt(start, 10) : NaN;
        const countNumber = count !== null ? parseInt(count, 10) : NaN;
        if (!start || isNaN(startNumber as number)) {
            setError('start param is missing or invalid number');
            return;
        }
        if (!count || isNaN(countNumber as number)) {
            setError('count param is missing or invalid number');
            return;
        }
        setTimeout(() => {
            const notes = staffNotes[staff].slice(startNumber, startNumber+countNumber);
            notes.forEach((n) => {
                console.log(n);
                const el = document.getElementById(n);
                if (el) {
                    console.log("found it");
                    el.setAttribute("style", "fill: red !important;");
                } else {
                    console.log("element not in the doc, can't set")
                }
            })
        }, 1000);
    }, [renderedScore, staff, staffNotes, start, count])

    if (error) {
        return <div style={{display: "flex"}}>Unexpected error: {error}</div>
    }

    return (
        <div style={{display: "flex"}}>
            <Container>
                <Row>
                    <Col>
                        {renderedScore &&
                            <>
                                <Button onClick={() => {
                                    // If the param is set, decrease only if it stays above page 1, otherwise page 1
                                    setSearchParams(newPageParams(pageInt ? (pageInt > 1 ? pageInt - 1 : pageInt ?? 1): 1));
                                }}>Prev Page</Button>
                                <Button onClick={() => {
                                    // Don't know how many pages we have, don't add a limit
                                    setSearchParams(newPageParams(pageInt ? (pageInt + 1): 1));
                                }}>Next Page</Button>
                            <div style={{width: '800px'}} id={"q_svg_output"} className="score"
                                 dangerouslySetInnerHTML={{__html: renderedScore}} />
                            </>}
                    </Col>
                </Row>
            </Container>
        </div>
    );
}

export default Viewer;
