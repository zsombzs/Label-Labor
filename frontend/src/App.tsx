import { BrowserRouter, Route, Routes } from "react-router-dom";
import { RequireAuth } from "./auth/RequireAuth";
import { subpages } from "./config/subpages";
import { GeneratorPage } from "./components/GeneratorPage";
import { Landing } from "./pages/Landing";
import { LanguageProvider } from "./i18n/LanguageContext";

export default function App() {
  return (
    <LanguageProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          {Object.values(subpages).map((config) => (
            <Route
              key={config.subpageId}
              path={`/${config.subpageId}`}
              element={
                // A demo is login mögött van, csak a belépési adatai nyilvánosak.
                <RequireAuth>
                  <GeneratorPage config={config} />
                </RequireAuth>
              }
            />
          ))}
        </Routes>
      </BrowserRouter>
    </LanguageProvider>
  );
}
