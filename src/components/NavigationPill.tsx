import { MessageCircle, Settings, Archive } from "lucide-react";
import { motion } from "framer-motion";
import { type DockMode } from "./BottomPillDock";

interface NavigationPillProps {
  mode: DockMode;
  onModeChange: (mode: DockMode) => void;
  position?: "center" | "right";
}

const dockItems: { mode: DockMode; icon: React.ElementType; label: string }[] = [
  { mode: "settings", icon: Settings, label: "Settings" },
  { mode: "chat", icon: MessageCircle, label: "Chat" },
  { mode: "artifacts", icon: Archive, label: "Artifacts" },
];

const NavigationPill = ({ mode, onModeChange, position = "center" }: NavigationPillProps) => {
  return (
    <nav 
      className={`gradient-border pill flex items-center gap-1 px-2 py-2 shadow-lg ${
        position === "right" ? "ml-auto" : ""
      }`} 
      aria-label="Main navigation"
    >
      {dockItems.map(({ mode: itemMode, icon: Icon, label }) => {
        const isActive = mode === itemMode;
        return (
          <button
            key={itemMode}
            onClick={() => onModeChange(itemMode)}
            className="relative flex items-center gap-2 px-4 py-2.5 pill transition-all"
            aria-label={label}
            aria-current={isActive ? "page" : undefined}
          >
            {isActive && (
              <motion.div
                layoutId="nav-active"
                className="absolute inset-0 bg-primary pill"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-2">
              <Icon
                className={`w-4 h-4 transition-colors ${
                  isActive ? "text-primary-foreground" : "text-muted-foreground"
                }`}
              />
              {isActive && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  className="text-xs font-medium text-primary-foreground whitespace-nowrap"
                >
                  {label}
                </motion.span>
              )}
            </span>
          </button>
        );
      })}
    </nav>
  );
};

export default NavigationPill;
