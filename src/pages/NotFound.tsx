import { useLocation } from "react-router-dom";
import { useEffect } from "react";
const NotFound = () => {
  const location = useLocation();
  useEffect(() => { console.error("404:", location.pathname); }, [location.pathname]);
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <h1>404</h1>
        <p>Página não encontrada</p>
        <a href="/" style={{ color: '#22C55E' }}>Voltar para o Início</a>
      </div>
    </div>
  );
};
export default NotFound;
