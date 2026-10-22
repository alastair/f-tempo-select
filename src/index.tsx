import React from 'react';
import {createRoot} from 'react-dom/client';
import './index.css';
import {BrowserRouter, Route, Routes} from "react-router-dom";
import App from './App';
import Viewer from "./Viewer";

createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <BrowserRouter basename="/ngram">
            <Routes>
                <Route path="/" element={<App />} />
                <Route path="view/:id" element={<Viewer />} />
            </Routes>
        </BrowserRouter>
    </React.StrictMode>
);

