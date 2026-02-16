import { Settings, Link, User, Tag, Key } from "lucide-react";

const settingsSections = [
  {
    icon: Link,
    title: "ClickUp Integration",
    description: "Connect spaces and configure task routing",
    status: "Not connected",
  },
  {
    icon: User,
    title: "Profile",
    description: "Manage your account and preferences",
    status: "Configure",
  },
  {
    icon: Tag,
    title: "Domains",
    description: "Set up business areas and context tags",
    status: "0 configured",
  },
  {
    icon: Key,
    title: "API Keys",
    description: "Manage credentials for integrations",
    status: "Secure",
  },
];

const SettingsView = () => {
  return (
    <div className="flex-1 overflow-y-auto px-4 pt-6 pb-44 scrollbar-hide">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
            <Settings className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Settings</h1>
            <p className="text-xs text-muted-foreground">Configure your LifeOS workspace</p>
          </div>
        </div>

        <div className="space-y-3">
          {settingsSections.map(({ icon: Icon, title, description, status }) => (
            <button
              key={title}
              className="w-full flex items-center gap-4 p-4 bg-card rounded-2xl border border-border hover:border-foreground/10 transition-all text-left group"
            >
              <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center group-hover:bg-accent transition-colors">
                <Icon className="w-5 h-5 text-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{title}</p>
                <p className="text-xs text-muted-foreground truncate">{description}</p>
              </div>
              <span className="text-xs text-muted-foreground pill bg-secondary px-3 py-1">
                {status}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SettingsView;
