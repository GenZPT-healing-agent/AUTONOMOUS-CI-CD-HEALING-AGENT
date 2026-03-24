import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { HeroSection } from "../components/HeroSection";
import { FeaturesSection } from "../components/FeaturesSection";
import { Navigation } from "../components/Navigation";
import { Magnetic } from "../components/motion/Magnetic";

export const LandingPage = () => {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen">
      {/* Navigation */}
      <Navigation />

      {/* Main content */}
      <div className="relative z-10">
        {/* Hero Section */}
        <HeroSection />

        {/* Features Section with scroll transitions */}
        <FeaturesSection />

        {/* Additional sections can go here */}
        <motion.section
          className="relative py-32 px-4"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 1 }}
        >
          <div className="max-w-4xl mx-auto text-center">
            <motion.h2
              className="text-4xl sm:text-5xl font-bold mb-6"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
            >
              <span className="heading-gradient">Ready to Transform</span>
              <br />
              <span className="text-white/80">Your DevOps Workflow?</span>
            </motion.h2>

            <motion.p
              className="text-lg text-white/50 mb-10"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.2 }}
            >
              Join teams who have eliminated pipeline downtime and accelerated
              delivery with autonomous healing.
            </motion.p>

            <motion.div
              className="flex flex-col sm:flex-row gap-4 justify-center"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.4 }}
            >
              <Magnetic strength={0.5}>
                <button
                  className="cyber-button !px-8 !py-4 !text-base"
                  onClick={() => navigate("/terminal")}
                >
                  Get Started Free
                </button>
              </Magnetic>
              <Magnetic strength={0.4}>
                <button
                  className="relative inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-8 py-4 text-base font-semibold text-white/90 backdrop-blur-sm transition-all duration-300 hover:bg-white/10 hover:border-white/30"
                  onClick={() => {
                    // Scroll to top (contact form would go here)
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  Schedule Demo
                </button>
              </Magnetic>
            </motion.div>
          </div>
        </motion.section>
      </div>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 py-12 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-sm text-white/40">
            © 2026 Autonomous CI/CD Healing Agent. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};
