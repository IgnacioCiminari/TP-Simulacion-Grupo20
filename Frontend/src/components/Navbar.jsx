import { NavLink } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";
import { Sun, Moon, Activity } from "lucide-react";

const navItems = [
    { to: "/config", label: "Configuración" },
    { to: "/stats", label: "Estadísticas" },
    { to: "/table", label: "Tabla" },
    { to: "/graph", label: "Gráficos" },
];

export default function Navbar() {
    const { theme, toggleTheme } = useTheme();

    return (
        <header className="sticky top-0 z-50 w-full border-b border-zinc-200 bg-white/80 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/80">
            <div className="mx-auto flex h-16 max-w-screen-xl items-center justify-between px-6">
                {/* Logo / Brand */}
                <div className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-zinc-900 dark:text-zinc-100" />
                    <span className="font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                        Simulación RTV
                    </span>
                </div>

                {/* Nav Links */}
                <nav className="flex items-center gap-1">
                    {navItems.map(({ to, label }) => (
                        <NavLink
                            key={to}
                            to={to}
                            className={({ isActive }) =>
                                [
                                    "rounded-md px-4 py-2 text-sm font-medium transition-colors",
                                    isActive
                                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                                        : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
                                ].join(" ")
                            }
                        >
                            {label}
                        </NavLink>
                    ))}
                </nav>

                {/* Theme Toggle */}
                <button
                    onClick={toggleTheme}
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-zinc-200 text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                    aria-label="Toggle theme"
                >
                    {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
            </div>
        </header>
    );
}
