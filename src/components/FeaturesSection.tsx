import { useRef } from "react";
import { motion, useScroll, useTransform, useSpring } from "framer-motion";
import { GlowPulse } from "./motion/GlowPulse";
import { TiltCard } from "./motion/TiltCard";

interface Feature {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
  glowColor: string;
}

const features: Feature[] = [
  {
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
        />
      </svg>
    ),
    title: "Intelligent Analysis",
    description: "AI-powered root cause detection identifies issues across your entire pipeline in seconds.",
    color: "#00FF7F",
    glowColor: "rgba(0, 255, 127, 0.3)",
  },
  {
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
        />
      </svg>
    ),
    title: "Auto-Remediation",
    description: "Generates context-aware patches and applies fixes automatically with zero human intervention.",
    color: "#00E5FF",
    glowColor: "rgba(0, 229, 255, 0.3)",
  },
  {
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
        />
      </svg>
    ),
    title: "Continuous Verification",
    description: "Real-time testing ensures every fix passes before deployment, maintaining system integrity.",
    color: "#76B900",
    glowColor: "rgba(118, 185, 0, 0.3)",
  },
];

export const FeaturesSection = () => {
  const containerRef = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
  });

  const headerY = useTransform(smoothProgress, [0, 0.3], [100, 0]);
  const headerOpacity = useTransform(smoothProgress, [0, 0.2, 0.8, 1], [0, 1, 1, 0.3]);

  return (
    <section
      ref={containerRef}
      className="relative py-32 px-4 overflow-hidden"
    >
      {/* Background elements */}
      <div className="absolute inset-0 cyber-grid-bg opacity-20" />
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(0, 255, 127, 0.08) 0%, transparent 70%)",
          filter: "blur(80px)",
        }}
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Section header */}
        <motion.div
          className="text-center mb-20"
          style={{
            y: headerY,
            opacity: headerOpacity,
          }}
        >
          <motion.div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-cyber-green/30 bg-cyber-green/5 backdrop-blur-sm mb-6"
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
          >
            <GlowPulse size={5} color="#00FF7F" />
            <span className="label-cyber text-cyber-green/80">How It Works</span>
          </motion.div>

          <motion.h2
            className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <span className="heading-gradient">Intelligent Pipeline</span>
            <br />
            <span className="text-white/80">Self-Healing Technology</span>
          </motion.h2>

          <motion.p
            className="text-lg text-white/50 max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            Three-stage autonomous process that transforms CI/CD failures into
            verified fixes without breaking your flow.
          </motion.p>
        </motion.div>

        {/* Features grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <FeatureCard
              key={index}
              feature={feature}
              index={index}
              scrollProgress={smoothProgress}
            />
          ))}
        </div>

        {/* Process flow visualization */}
        <motion.div
          className="mt-24 relative"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-150px" }}
          transition={{ duration: 1, delay: 0.3 }}
        >
          <div className="glass-card p-8 sm:p-12 rounded-3xl overflow-hidden">
            {/* Animated flow line */}
            <div className="relative flex flex-col sm:flex-row items-center justify-between gap-8 sm:gap-4">
              {["Detect", "Fix", "Verify", "Deploy"].map((step, idx) => (
                <div key={idx} className="flex items-center gap-4 flex-1">
                  <motion.div
                    className="relative flex flex-col items-center"
                    initial={{ opacity: 0, scale: 0.8 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: idx * 0.15, duration: 0.6 }}
                  >
                    <motion.div
                      className="w-16 h-16 rounded-2xl border-2 flex items-center justify-center font-mono text-sm font-bold relative overflow-hidden"
                      style={{
                        borderColor: idx <= 2 ? "#00FF7F" : "#00E5FF",
                        backgroundColor: idx <= 2 ? "rgba(0, 255, 127, 0.05)" : "rgba(0, 229, 255, 0.05)",
                        color: idx <= 2 ? "#00FF7F" : "#00E5FF",
                      }}
                      whileHover={{ scale: 1.05 }}
                    >
                      {/* Number badge */}
                      <span className="relative z-10">{idx + 1}</span>

                      {/* Glow effect */}
                      <motion.div
                        className="absolute inset-0 opacity-0"
                        style={{
                          background: `radial-gradient(circle, ${idx <= 2 ? "rgba(0, 255, 127, 0.3)" : "rgba(0, 229, 255, 0.3)"} 0%, transparent 70%)`,
                        }}
                        whileHover={{ opacity: 1 }}
                      />
                    </motion.div>

                    <motion.div
                      className="mt-4 text-center"
                      initial={{ opacity: 0, y: 10 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: idx * 0.15 + 0.2, duration: 0.6 }}
                    >
                      <div className="text-sm font-semibold text-white/90 mb-1">
                        {step}
                      </div>
                      <div className="text-xs text-white/40">
                        {idx === 0 && "Scan & Analyze"}
                        {idx === 1 && "Generate Patch"}
                        {idx === 2 && "Run Tests"}
                        {idx === 3 && "Auto-Commit"}
                      </div>
                    </motion.div>
                  </motion.div>

                  {/* Arrow connector */}
                  {idx < 3 && (
                    <motion.div
                      className="hidden sm:block flex-1 h-0.5 bg-gradient-to-r from-cyber-green/30 to-cyan-400/30 relative overflow-hidden"
                      initial={{ scaleX: 0 }}
                      whileInView={{ scaleX: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: idx * 0.15 + 0.3, duration: 0.6 }}
                    >
                      <motion.div
                        className="absolute inset-0 bg-gradient-to-r from-transparent via-cyber-green to-transparent"
                        animate={{
                          x: ["-100%", "200%"],
                        }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                          ease: "linear",
                          delay: idx * 0.3,
                        }}
                      />
                    </motion.div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

interface FeatureCardProps {
  feature: Feature;
  index: number;
  scrollProgress: any;
}

const FeatureCard = ({ feature, index, scrollProgress }: FeatureCardProps) => {
  const cardRef = useRef<HTMLDivElement>(null);

  const yOffset = useTransform(
    scrollProgress,
    [0, 0.5],
    [100 + index * 20, 0]
  );

  const opacity = useTransform(
    scrollProgress,
    [0.1 + index * 0.05, 0.3 + index * 0.05],
    [0, 1]
  );

  return (
    <motion.div
      ref={cardRef}
      style={{
        y: yOffset,
        opacity,
      }}
    >
      <TiltCard>
        <div className="glass-card p-8 h-full rounded-2xl group hover:border-cyber-green/40 transition-all duration-500">
          {/* Icon container */}
          <motion.div
            className="w-16 h-16 rounded-xl mb-6 flex items-center justify-center relative overflow-hidden"
            style={{
              backgroundColor: `${feature.color}10`,
              border: `1px solid ${feature.color}40`,
            }}
            whileHover={{
              backgroundColor: `${feature.color}20`,
              boxShadow: `0 0 30px ${feature.glowColor}`,
            }}
            transition={{ duration: 0.3 }}
          >
            <motion.div
              style={{ color: feature.color }}
              whileHover={{ scale: 1.1, rotate: 5 }}
              transition={{ duration: 0.3 }}
            >
              {feature.icon}
            </motion.div>

            {/* Animated glow */}
            <motion.div
              className="absolute inset-0 opacity-0 group-hover:opacity-100"
              style={{
                background: `radial-gradient(circle, ${feature.glowColor} 0%, transparent 70%)`,
              }}
              transition={{ duration: 0.5 }}
            />
          </motion.div>

          {/* Content */}
          <h3 className="text-xl font-bold text-white/95 mb-3">
            {feature.title}
          </h3>
          <p className="text-sm text-white/50 leading-relaxed">
            {feature.description}
          </p>

          {/* Hover accent line */}
          <motion.div
            className="mt-6 h-0.5 rounded-full"
            style={{
              background: `linear-gradient(90deg, ${feature.color}, transparent)`,
              transformOrigin: "left",
            }}
            initial={{ scaleX: 0 }}
            whileHover={{ scaleX: 1 }}
            transition={{ duration: 0.5 }}
          />
        </div>
      </TiltCard>
    </motion.div>
  );
};
