import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import {BrowserRouter, Route, Routes} from "react-router-dom";
import App from './App';
import Viewer from "./Viewer";

ReactDOM.render(
    <React.StrictMode>
        <BrowserRouter basename="/ngram">
            <Routes>
                <Route path="/" element={<App />} />
                <Route path="view/:id" element={<Viewer />} />
            </Routes>
        </BrowserRouter>
    </React.StrictMode>,
    document.getElementById('root')
);

