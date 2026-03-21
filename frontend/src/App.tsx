import { BrowserRouter, Route, Routes } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AudioProvider } from "@/contexts/AudioContext";
import Index from "./pages/Index.tsx";
import Press from "./pages/Press.tsx";
import Clips from "./pages/Clips.tsx";
import NotFound from "./pages/NotFound.tsx";

const App = () => (
  <LanguageProvider>
    <AudioProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/press" element={<Press />} />
          <Route path="/clips" element={<Clips />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AudioProvider>
  </LanguageProvider>
);

export default App;
