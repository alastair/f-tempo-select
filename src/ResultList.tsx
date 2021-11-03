type NgramNote = {
    note: string
    id: string
    system: string
}

type NgramMatch = NgramNote[]

export type NgramResult = {
    match_id: string
    notes: NgramMatch[]
}

interface ResultListProps {
    results: NgramResult[];
    onResultSelect: (n: number) => void;
}

export default function ResultList (props: ResultListProps) {
    return <div><ul>
        {props.results.map((result, idx) => {
            return <li key={result.match_id}><a href="" onClick={(e) => {
                e.preventDefault();
                props.onResultSelect(idx)
            }}>{result.match_id} ({result.notes.length} match{result.notes.length === 1 ? '' : 'es'})</a></li>
        })}
    </ul>
    </div>
}