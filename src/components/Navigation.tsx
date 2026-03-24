import { motion } from "framer-motion";
import { Link, useLocation } from "react-router-dom";
import { GlowPulse } from "./motion/GlowPulse";
import { Magnetic } from "./motion/Magnetic";

export const Navigation = () => {
  const location = useLocation();
  const isHome = location.pathname === "/";
  const isTerminal = location.pathname === "/terminal";

  return (
    <motion.nav
      className="fixed top-0 left-0 right-0 z-50 px-4 py-4"
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, delay: 0.2 }}
    >
      <div className="max-w-7xl mx-auto">
        <div className="glass-card px-6 py-3 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <GlowPulse size={8} color="#00FF7F" />
            <span className="font-bold text-lg">
              <span className="heading-gradient">CI/CD</span>
              <span className="text-white/80 ml-2">Healer</span>
            </span>
          </Link>

          {/* Navigation links */}
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className={`text-sm font-medium transition-colors ${
                isHome
                  ? "text-cyber-green"
                  : "text-white/60 hover:text-white/90"
              }`}
            >
              Home
            </Link>
            <Link
              to="/terminal"
              className={`text-sm font-medium transition-colors ${
                isTerminal
                  ? "text-cyber-green"
                  : "text-white/60 hover:text-white/90"
              }`}
            >
              Terminal
            </Link>

            <Magnetic strength={0.4}>
              <Link
                to="/terminal"
                className="cyber-button !py-2 !px-4 !text-xs !rounded-lg ml-2"
              >
                Start Agent
              </Link>
            </Magnetic>
          </div>
        </div>
      </div>
    </motion.nav>
  );
};
