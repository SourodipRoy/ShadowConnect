import { useEffect, useState } from "react";
import { Switch } from "./ui/switch";

export default function ThemeToggle() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "dark") {
      document.documentElement.classList.add("dark");
      setEnabled(true);
    }
  }, []);

  const toggle = (checked: boolean) => {
    setEnabled(checked);
    if (checked) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Switch id="theme-toggle" checked={enabled} onCheckedChange={toggle} />
      <label htmlFor="theme-toggle" className="text-sm">
        Dark mode
      </label>
    </div>
  );
}
