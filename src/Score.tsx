import React, {SyntheticEvent} from "react";
import DragSelect from "dragselect/dist/DragSelect";
import type {NgramResult} from "./ResultList";
import ResultList from "./ResultList";
import {Button, Col, Container, Form, Row} from "react-bootstrap";
import Result from "./Result";

type Pitch = {
  pitch: string,
  oct: number
}

/**
 * Take an array of pitches (objects with key pitch (letter) and oct (number))
 * and return a mapping of absolute pitches differences between the notes
 * - if there is no change
 * a for pitch 1, b for pitch 2, c for pitch 3. Upper-case if pitch is increasing,
 * lower-case if pitch is decreasing. Doesn't take in to account accidentals
 * @param pitches
 */
function pitchesToIntervalMapping(pitches: Pitch[]) {
  const alphabet = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

  const pitch_nums = pitches.map(function(e) {
    // TODO: This replicates the behaviour of the awk script, where g is 0 and a->f is 1-6
    //  appears to be a bug because of awk string indexes starting from 1
    return (alphabet.indexOf(e.pitch.toUpperCase()) + 1) % 7 + ((7 * e.oct) % 7);
  });

  let pitch_intervals = [];
  // Finish one before the end, because we're looking at the gaps
  for (let i = 0; i < pitch_nums.length - 1; i++) {
    pitch_intervals.push(pitch_nums[i + 1] - pitch_nums[i]);
  }
  console.debug(`pitch intervasl: ${pitch_intervals}`);
  return intervalsToAlphabet(pitch_intervals);
}

function intervalsToAlphabet(pitch_intervals: number[]) {
  const interval_mapping = '-abcdefghijklmnopqrstuvwxyz'.split('');

  return pitch_intervals.map(function(i) {
    // Clamp to a maximum interval of 25 notes
    if (i < -26) i = -26;
    if (i > 26) i = 26;
    let letter = interval_mapping[Math.abs(i)];
    if (i > 0) {
      letter = letter.toUpperCase();
    }
    return letter;
  }).join(' ');
}

/**
 * f-tempo index specific interval mapping function
 * convert a string of pitches to a search string
 * userPitches: 1 1 0 -2 (up1 up1 same down2)
 * This has some black magic due to a bug in the original mapping function
 * 1 and -1 => 6 and -6 and vice-versa. Other numbers are the same
 * @param userPitches
 */
function userPitchesToIntervalMapping(userPitches: string) {
  //f-tempo index specific interval mapping function
  const pitch_intervals = userPitches.split(" ").map((n) => {
    return parseInt(n, 10);
  });

  return intervalsToAlphabet(pitch_intervals);
}

interface ScoreState {
  width: number | undefined;
  height: number | undefined;
  verovioTk: any;
  renderedScore?: any;
  mei?: string;
  noteIds?: string[];
  notePitches?: Pitch[];
  userInput: string;
  interval: boolean;
  error?: string;
  selectedNotes?: Pitch[];
  searchResults?: NgramResult[];
  selectedResult?: number | undefined;
}

class Score extends React.Component<{}, ScoreState> {

  constructor(props: Readonly<{}>) {
    super(props);
    this.state = {
      width: undefined,
      height: undefined,
      verovioTk: new window.verovio.toolkit(),
      interval: false,
      userInput: ''
    }
  }

  loadVerovio = () => {
    fetch(process.env.PUBLIC_URL + '/GB-Lbl_A103b_025_0.mei').then(r => r.text()).then(meiXML => {
      const options = {
        footer: "none",
        shrinkToFit: true,
        svgViewBox: true
      };
      this.state.verovioTk.setOptions(options);
      //console.debug(options)
      //console.debug(this.state.verovioTk.getOptions());
      let svg = this.state.verovioTk.renderData(meiXML, {});

      // We only have to do this once - create a mapping of MEI id -> {note, oct}
      // and also an ordered list of MEI id (so that we can see if a selection has a
      // continuous sequence of notes or not)
      const parser = new DOMParser();
      const meiDoc = parser.parseFromString(meiXML, "application/xml");
      const notes = meiDoc.documentElement.getElementsByTagName("note");
      const pitches = Array.from(notes).map(function(note) {
        const pitch = note.attributes.getNamedItem("pname")?.value!;
        const oct = note.attributes.getNamedItem("oct")?.value!;
        return {pitch, oct: parseInt(oct, 10)};
      });
      const noteIds = Array.from(notes).map(function(note) {
        return note.attributes.getNamedItem("xml:id")?.value!;
      });

      this.setState({
        renderedScore: svg,
        mei: meiXML,
        notePitches: pitches,
        noteIds: noteIds
      }, () => {
        // DragSelect requires a set of elements that are attached to the dom as the `selectables` parameter.
        // this means that we can't configure it until after we've rendered this.state.mei -
        // we do this in the post-setState callback. We've observed that at this point
        // the element appears to be in the dom.
        const selector = new DragSelect({
          selectables: Array.from(document.querySelectorAll('.note')),
          area: document.getElementById('q_svg_output')!,
          selectedClass: 'selected',
        });
        selector.subscribe("dragstart", () => {
          document.body.classList.add('s-noselect');
        })
        selector.subscribe("callback", (callbackObject: CallbackObject) => {
          document.body.classList.remove('s-noselect');
          if (callbackObject.items) {
            this.onSelectionChange(callbackObject.items);
          }
        })
      })
    })
  }

  onSelectionChange = (elements: Array<SVGElement>) => {
    console.debug("selected")
    console.debug(elements)
    if (elements.length >= 2) {
      let firstPosition = this.state.noteIds?.length!;
      let lastPosition = 0;
      elements.forEach((e) => {
        const elementId = e.attributes.getNamedItem("id")?.value!;
        const position = this.state.noteIds?.indexOf(elementId);
        if (position !== undefined) {
          firstPosition = Math.min(firstPosition, position);
          lastPosition = Math.max(lastPosition, position);
        }
      });

      // TODO: find the first and last position in noteIds that anything from `elements` appears
      console.log(`first-pos: ${firstPosition}`)
      console.log(`last-pos: ${lastPosition}`)

      let error: string | undefined = undefined;
      let selected: Pitch[] | undefined = undefined;
      if (firstPosition !== undefined && lastPosition !== undefined) {
        console.log(`length: ${lastPosition-firstPosition}`)
        if (lastPosition - firstPosition > elements.length) {
          // We selected notes over more than 1 system, skipping the notes from the end of the first system
          // as this isn't a contiguous list of notes, don't do anything in this case
          console.error(`len is ${lastPosition-firstPosition} but num elements is ${elements.length}`)
          error = "too many selected";
        } else {
          selected = this.state.notePitches?.slice(firstPosition, lastPosition + 1);
          console.debug(selected)
        }
      }
      this.setState({
        error: error,
        selectedNotes: selected,
        searchResults: undefined,
        selectedResult: undefined
      })
    } else {
      this.setState({
        error: undefined,
        selectedNotes: undefined,
        searchResults: undefined,
        selectedResult: undefined
      })
    }
  }

  onSelectResult = (selectedIndex: number) => {
    this.setState({selectedResult: selectedIndex})
  }

  onImageLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    const target = e.target as HTMLImageElement;
    console.debug(`width: ${target.offsetWidth}, height: ${target.offsetHeight}`)
    this.setState({
      width: target.offsetWidth,
      height: target.offsetHeight
    }, () => {
      this.loadVerovio();
    })
  }

  getQuery = () => {
    let query = undefined;
    if (this.state.userInput !== '') {
      if (!this.state.interval) {
        query = this.state.userInput;
      } else {
        query = userPitchesToIntervalMapping(this.state.userInput);
      }
    } else if (this.state.selectedNotes) {
      if (!this.state.interval) {
        query = this.state.selectedNotes.map((e) => {
          return `${e.pitch}${e.oct}`;
        }).join(" ");
      } else {
        query = pitchesToIntervalMapping(this.state.selectedNotes);
      }
    }
    return query;
  }

  doSearch = () => {
    const query = this.getQuery();
    if (!query) return;

    const data = { ngrams: query, interval: this.state.interval };

    fetch('https://solrdev.f-tempo.org/api/ngram', {
    //fetch('http://localhost:8000/api/ngram', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })
    .then(response => response.json())
    .then(data => {
      console.log('Success:', data);
      this.setState({searchResults: data.data});
    })
    .catch((error) => {
      console.error('Error:', error);
    });
  }

  render() {
    const query = this.getQuery();
    const show = query !== undefined;
    return <Container>
      <Row>
        <Col>
          {this.state.renderedScore &&
              <div style={{width: '500px'}} id={"q_svg_output"} className="score"
                   dangerouslySetInnerHTML={{__html: this.state.renderedScore}} />}
          <img alt={"some score"} width="500" src={process.env.PUBLIC_URL + '/GB-Lbl_A103b_025_0.jpg'} onLoad={this.onImageLoad} />
          <p>
            {this.state.error && <span>Error: {this.state.error}</span> }
          </p>
          <p>{show && query}<br/>
            <Form.Check inline label="Use intervals" name="interval" checked={this.state.interval} onChange={() => {
              this.setState({
                interval: !this.state.interval
              })
            }
            } />
            <Form.Group className="mb-3" controlId="exampleForm.ControlInput1">
              <Form.Label>User-provided query</Form.Label>
            <Form.Control placeholder="User-provided query" value={this.state.userInput} onChange={(e) => {
              this.setState({
                userInput: e.target.value
              })
            }
            } />
              <Form.Text muted>
                Use lower-case note name + octaves, separated by space, e.g. "c4 a3 b3 c4 d4"<br />
                For intervals, use diatonic pitch steps as numbers positive for up, negative for down, 0 for no change, e.g. "-2 1 1 1 0 -1"
              </Form.Text>
            </Form.Group>
            <Button onClick={this.doSearch}>Search</Button>
          </p>
          {this.state.searchResults && <ResultList results={this.state.searchResults} onResultSelect={this.onSelectResult} />}
        </Col>
        <Col>{ this.state.selectedResult !== undefined && <Result result={this.state.searchResults![this.state.selectedResult]} />}</Col>
      </Row>
    </Container>
  }
}

export default Score;