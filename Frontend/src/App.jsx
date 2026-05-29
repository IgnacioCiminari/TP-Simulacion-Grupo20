import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import { SimulationProvider } from "./context/SimulationContext";
import Layout from "./components/Layout";
import Config from "./pages/Config";
import Table from "./pages/Table";
import Graph from "./pages/Graph";

function App() {
  return (
    <ThemeProvider>
      <SimulationProvider>
        <BrowserRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<Navigate replace to="/config" />} />
              <Route path="/config" element={<Config />} />
              <Route path="/table" element={<Table />} />
              <Route path="/graph" element={<Graph />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </SimulationProvider>
    </ThemeProvider>
  );
}

export default App;
