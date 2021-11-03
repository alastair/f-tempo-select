import React, {SyntheticEvent} from "react";
import DragSelect from "dragselect/dist/DragSelect";
import type {NgramResult} from "./ResultList";
import ResultList from "./ResultList";
import {Button, Col, Container, Row } from "react-bootstrap";
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
  const interval_mapping = '-abcdefghijklmnopqrstuvwxyz'.split('');

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
  return pitch_intervals.map(function(i) {
    // Clamp to a maximum interval of 25 notes
    if (i < -26) i = -26;
    if (i > 26) i = 26;
    let letter = interval_mapping[Math.abs(i)];
    if (i > 0) {
      letter = letter.toUpperCase();
    }
    return letter;
  }).join('');
}

interface ScoreState {
  width: number | undefined;
  height: number | undefined;
  verovioTk: any;
  renderedScore?: any;
  mei?: string;
  noteIds?: string[];
  notePitches?: Pitch[];
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

  doSearch = () => {
    if (!this.state.selectedNotes) return;
    const query = this.state.selectedNotes.map((e) => {
      return `${e.pitch}${e.oct}`;
    }).join(" ");

    const data = { ngrams: query };

    fetch('http://localhost:8000/api/ngram', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })
    .then(response => response.json())
    .then(data => {
      console.log('Success:', data);
      this.setState({searchResults: data});
    })
    .catch((error) => {
      console.error('Error:', error);
    });
  }

  render() {
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
          <p>{this.state.selectedNotes && this.state.selectedNotes.map((e) => {
            return `${e.pitch}${e.oct}  `;
          })}<br/>
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