import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { SUPABASE_CLIENT_CONFIG_ERROR } from "./integrations/supabase/client";
import AppErrorBoundary from "./components/AppErrorBoundary";

const queryClient = new QueryClient();

const App = () => {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          {SUPABASE_CLIENT_CONFIG_ERROR && (
            <div className="fixed inset-x-0 top-0 z-[100] border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
              LifeOS is missing required public Supabase environment variables on this deployment. Set
              <span className="mx-1 font-medium">`VITE_SUPABASE_URL`</span>
              and
              <span className="mx-1 font-medium">`VITE_SUPABASE_ANON_KEY`</span>
              in Vercel project settings, then redeploy.
            </div>
          )}
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
};

export default App;
