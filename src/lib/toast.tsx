import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
const C = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(C);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [m, setM] = useState('');
  const show = useCallback((msg: string) => { setM(msg); window.setTimeout(() => setM((c) => (c === msg ? '' : c)), 2600); }, []);
  return <C.Provider value={show}>{children}{m && <div className="toast" role="status">{m}</div>}</C.Provider>;
}
