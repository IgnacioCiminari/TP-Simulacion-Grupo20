import Navbar from "./Navbar";

export default function Layout({ children }) {
    return (
        <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
            <Navbar />
            <main className="mx-auto max-w-screen-xl px-6 py-8">
                {children}
            </main>
        </div>
    );
}
