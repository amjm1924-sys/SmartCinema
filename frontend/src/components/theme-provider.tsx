
import { createContext, useContext, useEffect, useState } from "react";
import { Theme, themes } from "@/lib/themes";

type ThemeProviderProps = {
    children: React.ReactNode;
    defaultTheme?: Theme;
    storageKey?: string;
}

type ThemeProviderState = {
    theme: Theme;
    setTheme: (theme: Theme) => void;
}

const initialState: ThemeProviderState = {
    theme: "default",
    setTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
    children,
    defaultTheme = "default",
    storageKey = "app-theme",
    ...props
}: ThemeProviderProps) {
    const [theme, setTheme] = useState<Theme>(() => {
        return (localStorage.getItem(storageKey) as Theme) || defaultTheme;
    });

    useEffect(() => {
        const root = window.document.documentElement;
        const themeColors = themes[theme]?.colors || themes['default'].colors;

        // Remove old classes
        root.classList.remove("light", "dark");
        // Add new class (simple logic: minimal/pastel/cream/coffee are light, others dark)
        const isLight = ['minimal', 'pastel', 'cream', 'coffee'].includes(theme);
        root.classList.add(isLight ? "light" : "dark");

        // Set CSS variables
        Object.entries(themeColors).forEach(([key, value]) => {
            // Convert camelCase to kebab-case
            const cssVar = `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
            root.style.setProperty(cssVar, value);
        });

        // Explicitly set background color to body to prevent white flash
        root.style.backgroundColor = `hsl(${themeColors.background})`;

        localStorage.setItem(storageKey, theme);
    }, [theme, storageKey]);

    const value = {
        theme,
        setTheme: (theme: Theme) => {
            setTheme(theme);
        },
    };

    return (
        <ThemeProviderContext.Provider {...props} value={value}>
            {children}
        </ThemeProviderContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => {
    const context = useContext(ThemeProviderContext);

    if (context === undefined)
        throw new Error("useTheme must be used within a ThemeProvider");

    return context;
}


