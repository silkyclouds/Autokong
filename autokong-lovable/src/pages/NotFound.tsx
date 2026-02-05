import { Link } from "react-router-dom";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  return (
    <div className="flex min-h-[calc(100vh-2.5rem)] items-center justify-center p-8">
      <div className="text-center">
        <p className="text-8xl font-bold text-primary/20">404</p>
        <h1 className="mt-4 text-2xl font-semibold text-foreground">Page not found</h1>
        <p className="mt-2 text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Button asChild className="mt-6">
          <Link to="/">
            <Home className="mr-2 h-4 w-4" />
            Back to Run
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
