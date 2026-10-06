// Fundo animado da tela inteira (tema claro): manchas de cor desfocadas que se movem devagar, como no "Background Gradient
// Animation". Só `transform` é animado (barato para a GPU) e o desfoque fica num contêiner estático. Some no tema escuro,
// no celular e para quem pede menos movimento (ver .app-backdrop em globals.css).
export function AppBackdrop() {
  return (
    <div className="app-backdrop" aria-hidden="true">
      <div className="app-backdrop-blobs">
        <i className="app-blob app-blob-1" />
        <i className="app-blob app-blob-2" />
        <i className="app-blob app-blob-3" />
        <i className="app-blob app-blob-4" />
        <i className="app-blob app-blob-5" />
      </div>
    </div>
  );
}
