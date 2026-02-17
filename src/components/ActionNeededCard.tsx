import { useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, X } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { ChatMessage } from "./ChatView";

interface ActionNeededCardProps {
  action: NonNullable<ChatMessage["actionNeeded"]>;
  onSubmit: (data: Record<string, string>) => void;
  onDismiss?: () => void;
  onOpenSettings?: () => void;
}

const ActionNeededCard = ({ action, onSubmit, onDismiss, onOpenSettings }: ActionNeededCardProps) => {
  const [formData, setFormData] = useState<Record<string, string>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const handleInputChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="gradient-border rounded-2xl p-4 mb-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-r from-blue-500 to-pink-500 flex items-center justify-center mt-0.5">
          <AlertCircle className="w-3.5 h-3.5 text-white" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-foreground">Action Required</h3>
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="flex-shrink-0 p-1 rounded-md hover:bg-muted transition-colors"
              >
                <X className="w-3 h-3 text-muted-foreground" />
              </button>
            )}
          </div>
          
          <p className="text-sm text-muted-foreground mb-4">{action.description}</p>
          
          {action.type === 'setup' ? (
            <div className="flex gap-2 pt-2">
              <Button 
                onClick={() => {
                  onOpenSettings?.();
                  onDismiss?.();
                }} 
                size="sm" 
                className="flex-1"
              >
                Go to Settings
              </Button>
              {onDismiss && (
                <Button variant="outline" size="sm" onClick={onDismiss}>
                  Later
                </Button>
              )}
            </div>
          ) : action.fields && action.fields.length > 0 ? (
            <form onSubmit={handleSubmit} className="space-y-3">
              {action.fields.map((field) => (
                <div key={field.name} className="space-y-1.5">
                  <Label htmlFor={field.name} className="text-xs font-medium text-foreground">
                    {field.label}
                  </Label>
                  {field.type === "select" ? (
                    <select
                      id={field.name}
                      value={formData[field.name] || ""}
                      onChange={(e) => handleInputChange(field.name, e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                      required
                    >
                      <option value="">Select an option...</option>
                      {field.options?.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      id={field.name}
                      type={field.type}
                      placeholder={field.placeholder}
                      value={formData[field.name] || ""}
                      onChange={(e) => handleInputChange(field.name, e.target.value)}
                      className="text-sm"
                      required
                    />
                  )}
                </div>
              ))}
              
              <div className="flex gap-2 pt-2">
                <Button type="submit" size="sm" className="flex-1">
                  Submit
                </Button>
                {onDismiss && (
                  <Button type="button" variant="outline" size="sm" onClick={onDismiss}>
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
};

export default ActionNeededCard;
