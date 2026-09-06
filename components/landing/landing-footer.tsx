import Link from "next/link";

const FOOTER_LINKS = {
  Producto: [
    { label: "Características", href: "#caracteristicas" },
    { label: "Precios", href: "#precios" },
    { label: "Plataforma", href: "#plataforma" },
  ],
  Legal: [
    { label: "Privacidad", href: "#" },
    { label: "Términos", href: "#" },
  ],
  Contacto: [
    { label: "hola@nurahq.com", href: "mailto:hola@nurahq.com" },
    { label: "LinkedIn", href: "#" },
  ],
};

export function LandingFooter() {
  return (
    <footer className="bg-ink border-t border-white/10 text-white/60">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10">
          <div className="sm:col-span-2 lg:col-span-1">
            <p className="font-display text-xl font-semibold text-white">
              Nura<span className="text-sage">.</span>
            </p>
            <p className="mt-2 text-sm leading-relaxed">
              Tu inocuidad, finalmente clara.
            </p>
            <p className="mt-1 text-xs font-mono text-white/35">nurahq.com</p>
          </div>

          {Object.entries(FOOTER_LINKS).map(([title, links]) => (
            <div key={title}>
              <p className="text-xs font-mono uppercase tracking-wider text-white/40 mb-3">
                {title}
              </p>
              <ul className="space-y-2">
                {links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm hover:text-white transition-colors duration-200"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/35">
          <p>© {new Date().getFullYear()} Nura. Todos los derechos reservados.</p>
          <p className="font-mono">
            HACCP · Documentos · Monitoreo · Auditorías · CAPA
          </p>
        </div>
      </div>
    </footer>
  );
}
