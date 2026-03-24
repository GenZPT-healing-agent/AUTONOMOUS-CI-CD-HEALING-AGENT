import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform, useSpring } from "framer-motion";
import { gsap } from "gsap";
import { GlowPulse } from "./motion/GlowPulse";
import { Magnetic } from "./motion/Magnetic";
import { useNavigate } from "react-router-dom";

interface HeroSectionProps {
  onStartClick?: () => void;
}

export const HeroSection = ({ onStartClick }: HeroSectionProps) => {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const floatingCardsRef = useRef<HTMLDivElement>(null);

  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  // Scroll-based parallax effects
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });

  // Smooth spring physics
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });

  // Layered parallax transforms
  const headlineY = useTransform(smoothProgress, [0, 1], [0, -150]);
  const headlineOpacity = useTransform(smoothProgress, [0, 0.5], [1, 0]);
  const headlineScale = useTransform(smoothProgress, [0, 0.5], [1, 0.95]);

  const subtextY = useTransform(smoothProgress, [0, 1], [0, -120]);
  const subtextOpacity = useTransform(smoothProgress, [0, 0.6], [1, 0]);

  const ctaY = useTransform(smoothProgress, [0, 1], [0, -100]);
  const ctaOpacity = useTransform(smoothProgress, [0, 0.7], [1, 0]);

  const visualY = useTransform(smoothProgress, [0, 1], [0, -50]);
  const visualScale = useTransform(smoothProgress, [0, 1], [1, 1.1]);

  // Mouse tracking for interactive glow
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setMousePosition({
        x: ((e.clientX - rect.left) / rect.width) * 100,
        y: ((e.clientY - rect.top) / rect.height) * 100,
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // GSAP entrance animation
  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      tl.from(headlineRef.current, {
        y: 60,
        opacity: 0,
        scale: 0.95,
        filter: "blur(10px)",
        duration: 1.2,
        delay: 0.2,
      })
        .from(
          ".hero-subtext",
          {
            y: 40,
            opacity: 0,
            filter: "blur(8px)",
            duration: 1,
          },
          "-=0.8"
        )
        .from(
          ".hero-cta",
          {
            y: 30,
            opacity: 0,
            scale: 0.9,
            duration: 0.8,
            stagger: 0.1,
          },
          "-=0.6"
        )
        .from(
          ".floating-card",
          {
            y: 80,
            opacity: 0,
            scale: 0.8,
            filter: "blur(12px)",
            duration: 1.2,
            stagger: 0.15,
          },
          "-=0.9"
        );
    }, containerRef);

    return () => ctx.revert();
  }, []);

  const handleStartClick = () => {
    if (onStartClick) {
      onStartClick();
    } else {
      navigate("/terminal");
    }
  };

  const handleViewDemo = () => {
    // Scroll to features section or navigate to dashboard
    const featuresSection = document.querySelector('section:nth-of-type(2)');
    if (featuresSection) {
      featuresSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section
      ref={containerRef}
      className="relative min-h-screen flex items-center justify-center overflow-hidden py-20 px-4"
      style={{
        background: `radial-gradient(circle at ${mousePosition.x}% ${mousePosition.y}%, rgba(0, 255, 127, 0.08) 0%, transparent 50%)`,
      }}
    >
      {/* Animated grid background */}
      <div className="absolute inset-0 cyber-grid-bg opacity-30" />

      {/* Radial glow effect */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 800px 600px at 50% 40%, rgba(0, 255, 127, 0.12), transparent 60%)`,
        }}
        animate={{
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Main content container */}
      <div className="relative z-10 max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Left: Text content */}
          <motion.div
            className="text-center lg:text-left space-y-8"
            style={{
              y: headlineY,
            }}
          >
            {/* Eye-catching label */}
            <motion.div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-cyber-green/30 bg-cyber-green/5 backdrop-blur-sm"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1, duration: 0.6 }}
            >
              <GlowPulse size={6} color="#00FF7F" />
              <span className="label-cyber text-cyber-green/80">
                Next-Gen DevOps Automation
              </span>
            </motion.div>

            {/* Prominent headline */}
            <motion.div
              style={{
                opacity: headlineOpacity,
                scale: headlineScale,
              }}
            >
              <h1
                ref={headlineRef}
                className="text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-bold leading-[1.1] tracking-tight"
              >
                <span className="block heading-gradient mb-3">
                  Autonomous
                </span>
                <span className="block text-white/95">CI/CD Healing</span>
                <span className="block text-white/70 text-4xl sm:text-5xl lg:text-6xl mt-2">
                  in Real-Time
                </span>
              </h1>
            </motion.div>

            {/* Supporting text */}
            <motion.p
              className="hero-subtext text-lg sm:text-xl text-white/60 max-w-2xl mx-auto lg:mx-0 leading-relaxed"
              style={{
                y: subtextY,
                opacity: subtextOpacity,
              }}
            >
              Intelligent agent that <span className="text-cyber-green/80">analyzes failures</span>,
              <span className="text-cyan-400/80"> patches code</span>, and{" "}
              <span className="text-cyber-green/80">verifies fixes</span> — autonomously.
              Zero intervention, maximum uptime.
            </motion.p>

            {/* CTAs */}
            <motion.div
              className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start"
              style={{
                y: ctaY,
                opacity: ctaOpacity,
              }}
            >
              <Magnetic strength={0.5}>
                <button
                  className="hero-cta cyber-button !px-8 !py-4 !text-base group"
                  onClick={handleStartClick}
                >
                  <span>Initialize Agent</span>
                  <motion.svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    initial={{ x: 0 }}
                    whileHover={{ x: 4 }}
                    transition={{ duration: 0.2 }}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 7l5 5m0 0l-5 5m5-5H6"
                    />
                  </motion.svg>
                </button>
              </Magnetic>

              <Magnetic strength={0.4}>
                <button
                  className="hero-cta relative inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-8 py-4 text-base font-semibold text-white/90 backdrop-blur-sm transition-all duration-300 hover:bg-white/10 hover:border-white/30"
                  onClick={handleViewDemo}
                >
                  <span>View Demo</span>
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </button>
              </Magnetic>
            </motion.div>

            {/* Stats row */}
            <motion.div
              className="flex flex-wrap gap-8 justify-center lg:justify-start pt-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2, duration: 0.8 }}
            >
              {[
                { value: "99.9%", label: "Success Rate" },
                { value: "<30s", label: "Avg Fix Time" },
                { value: "24/7", label: "Monitoring" },
              ].map((stat, idx) => (
                <div key={idx} className="text-center lg:text-left">
                  <div className="text-2xl sm:text-3xl font-bold neon-text">
                    {stat.value}
                  </div>
                  <div className="text-xs sm:text-sm text-white/40 mt-1">
                    {stat.label}
                  </div>
                </div>
              ))}
            </motion.div>
          </motion.div>

          {/* Right: Visual elements */}
          <motion.div
            ref={floatingCardsRef}
            className="relative hidden lg:block"
            style={{
              y: visualY,
              scale: visualScale,
            }}
          >
            {/* Main UI mockup card */}
            <div className="floating-card relative glass-card p-6 rounded-2xl overflow-hidden">
              {/* Animated top bar */}
              <motion.div
                className="absolute top-0 left-0 right-0 h-1"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, #00FF7F, #00E5FF, transparent)",
                  backgroundSize: "200% 100%",
                }}
                animate={{ backgroundPosition: ["0% 50%", "200% 50%"] }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
              />

              {/* Mock terminal output */}
              <div className="space-y-3 font-mono text-sm">
                <div className="flex items-center gap-2">
                  <GlowPulse size={4} color="#00FF7F" />
                  <span className="text-cyber-green/70 text-xs uppercase tracking-wider">
                    Agent Active
                  </span>
                </div>

                <motion.div
                  className="space-y-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8, stagger: 0.1 }}
                >
                  {[
                    { icon: "✓", text: "Analyzing pipeline failure...", color: "text-cyan-400/70" },
                    { icon: "⚡", text: "Generating fix for syntax error...", color: "text-yellow-400/70" },
                    { icon: "✓", text: "Applied patch to utils.py:42", color: "text-cyber-green/70" },
                    { icon: "✓", text: "All tests passing", color: "text-cyber-green/80" },
                  ].map((line, idx) => (
                    <motion.div
                      key={idx}
                      className={`flex items-start gap-2 ${line.color}`}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 1 + idx * 0.2 }}
                    >
                      <span className="flex-shrink-0 w-4">{line.icon}</span>
                      <span className="text-white/50 text-xs">{line.text}</span>
                    </motion.div>
                  ))}
                </motion.div>

                {/* Progress bar */}
                <div className="relative h-2 bg-white/5 rounded-full overflow-hidden mt-4">
                  <motion.div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyber-green to-cyan-400 rounded-full"
                    style={{
                      boxShadow: "0 0 20px rgba(0, 255, 127, 0.5)",
                    }}
                    initial={{ width: "0%" }}
                    animate={{ width: "85%" }}
                    transition={{ delay: 1.5, duration: 2, ease: "easeOut" }}
                  />
                </div>
              </div>
            </div>

            {/* Floating accent cards */}
            <motion.div
              className="floating-card absolute -top-8 -right-8 glass-card p-4 rounded-xl"
              animate={{
                y: [0, -12, 0],
              }}
              transition={{
                duration: 6,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-cyber-green/10 border border-cyber-green/30 flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-cyber-green"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-semibold text-white/90">Auto-Fixed</div>
                  <div className="text-xs text-white/40">3 bugs resolved</div>
                </div>
              </div>
            </motion.div>

            <motion.div
              className="floating-card absolute -bottom-6 -left-6 glass-card p-4 rounded-xl"
              animate={{
                y: [0, 10, 0],
              }}
              transition={{
                duration: 5,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 0.5,
              }}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-cyan-400/10 border border-cyan-400/30 flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-cyan-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-semibold text-white/90">32ms</div>
                  <div className="text-xs text-white/40">Response time</div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        className="absolute bottom-10 left-1/2 -translate-x-1/2"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.8, duration: 0.8 }}
      >
        <motion.div
          className="flex flex-col items-center gap-2 text-white/30 text-xs uppercase tracking-widest"
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <span>Scroll</span>
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </motion.div>
      </motion.div>
    </section>
  );
};
