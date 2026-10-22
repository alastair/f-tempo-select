import React from 'react';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {BrowserRouter, Route, Routes} from 'react-router-dom';
import App from './App';
import Viewer from './Viewer';

const mei = '<mei><music><measure><staff n="1"><note xml:id="note1" pname="c" oct="4" /></staff></measure></music></mei>';
const svg = '<svg><g id="note1" class="note">Rendered note</g></svg>';
const renderData = jest.fn(() => svg);
const renderToSVG = jest.fn(() => svg);
const originalFetch = global.fetch;

beforeEach(() => {
  jest.clearAllMocks();
  renderData.mockReturnValue(svg);
  renderToSVG.mockReturnValue(svg);
  window.verovio = {toolkit: jest.fn(() => ({
    setOptions: jest.fn(), loadData: jest.fn(), renderData, renderToSVG,
  }))};
});

afterEach(() => { global.fetch = originalFetch; });

test('search maps backend IDs and match counts, and selection retrieves MEI', async () => {
  const fetchMock = jest.fn()
    .mockResolvedValueOnce({json: async () => ({status: 'ok', data: {results: [
      {id: 'Library_book/page', matches: [{notes: []}, {notes: []}]},
    ]}})})
    .mockResolvedValueOnce({text: async () => mei});
  global.fetch = fetchMock;
  render(<App />);

  fireEvent.change(screen.getByLabelText('User-provided query'), {target: {value: 'c4 d4 e4'}});
  fireEvent.click(screen.getByRole('button', {name: 'Search'}));
  fireEvent.click(await screen.findByRole('link', {name: 'Library_book/page (2 matches)'}));
  // Existing rendering deliberately waits for the scan's load event.
  fireEvent.load(screen.getAllByRole('img')[1]);

  await waitFor(() => expect(renderData).toHaveBeenCalledWith(mei, {}));
  expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/query_subsequence', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({subsequence: 'c4 d4 e4', interval: false}),
  });
  expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/get_mei?id=Library_book%2Fpage');
  expect(screen.getByText('Rendered note')).toBeInTheDocument();
});

test('viewer opens a deep /ngram/ route and highlights the requested note', async () => {
  global.fetch = jest.fn().mockResolvedValue({text: async () => mei});
  window.history.replaceState({}, '', '/ngram/view/score?staff=1&start=0&count=1&page=1');
  render(<BrowserRouter basename="/ngram"><Routes>
    <Route path="view/:id" element={<Viewer />} />
  </Routes></BrowserRouter>);

  const note = await screen.findByText('Rendered note');
  expect(global.fetch).toHaveBeenCalledWith('/api/get_mei?id=score');
  expect(renderToSVG).toHaveBeenCalledWith(1);
  await waitFor(() => expect(note).toHaveStyle('fill: red'), {timeout: 2000});
  fireEvent.click(screen.getByRole('button', {name: 'Next Page'}));
  await waitFor(() => expect(renderToSVG).toHaveBeenCalledWith(2));
  expect(window.location.search).toContain('page=2');
});
