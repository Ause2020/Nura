import type { ReactNode } from "react";

export function AuthSplitLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="min-h-screen flex">
      <div className="hidden md:flex md:w-1/2 bg-ink flex-col justify-center px-12 text-white">
        <h2 className="font-display text-2xl font-semibold mb-8">
          Tu inocuidad, finalmente clara.
        </h2>
        <ul className="space-y-6">
          <li className="flex gap-3">
            <span className="text-sage font-mono text-sm">01</span>
            <div>
              <p className="text-sm font-medium">Plan HACCP guiado</p>
              <p className="text-xs text-white/60 mt-0.5">
                Construye tu plan con árbol de decisiones y biblioteca de peligros.
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="text-sage font-mono text-sm">02</span>
            <div>
              <p className="text-sm font-medium">Auditorías desde el celular</p>
              <p className="text-xs text-white/60 mt-0.5">
                Ejecuta checklists, adjunta fotos y genera el informe automáticamente.
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="text-sage font-mono text-sm">03</span>
            <div>
              <p className="text-sm font-medium">CAPA que no se pierde</p>
              <p className="text-xs text-white/60 mt-0.5">
                Seguimiento automático y escalamiento de acciones vencidas.
              </p>
            </div>
          </li>
        </ul>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-white">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h1 className="font-display text-xl font-semibold text-forest">
              {title}
            </h1>
            <p className="text-xs text-ink-faint mt-1">{subtitle}</p>
          </div>
          {children}
          {footer}
        </div>
      </div>
    </div>
  );
}
