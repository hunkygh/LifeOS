import { Receipt, Upload, Filter, Search } from "lucide-react";

const ReceiptsView = () => {
  return (
    <div className="flex-1 overflow-y-auto px-4 pt-6 pb-44 scrollbar-hide">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
              <Receipt className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Receipts</h1>
              <p className="text-xs text-muted-foreground">Track expenses and uploads</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button className="p-2 rounded-xl bg-secondary hover:bg-accent transition-colors">
              <Filter className="w-4 h-4 text-foreground" />
            </button>
            <button className="p-2 rounded-xl bg-secondary hover:bg-accent transition-colors">
              <Search className="w-4 h-4 text-foreground" />
            </button>
          </div>
        </div>

        {/* Upload area */}
        <button className="w-full border-2 border-dashed border-border rounded-2xl p-8 flex flex-col items-center gap-3 hover:border-foreground/20 hover:bg-secondary/50 transition-all mb-6">
          <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
            <Upload className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">Upload Receipt</p>
            <p className="text-xs text-muted-foreground mt-1">
              Tap to capture or upload an image
            </p>
          </div>
        </button>

        {/* Empty state */}
        <div className="text-center py-12">
          <p className="text-sm text-muted-foreground">No receipts yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Upload your first receipt to get started
          </p>
        </div>
      </div>
    </div>
  );
};

export default ReceiptsView;
