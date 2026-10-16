import React, { useId, type ReactNode } from 'react';
import { MotionConfig, motion, type Variants } from 'motion/react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AnimatedGroup } from '@/components/ui/animated-group';
import './hero-section-6.css';

interface Iphone15ProProps extends React.SVGProps<SVGSVGElement> {
  width?: string | number;
  height?: string | number;
  src?: string;
  alt?: string;
}

/** An iPhone 15 Pro frame with a screenshot on its screen (hero-section-6, without Next.js). */
export const Iphone15Pro: React.FC<Iphone15ProProps> = ({ width = '100%', height, src, alt = 'ภาพหน้าจอบนมือถือ', className, ...props }) => {
  const clip = useId().replace(/:/g, '');
  return <div className={cn('relative', className)}>
    <svg width={width} height={height} style={{ display: 'block', height: height ?? 'auto' }} viewBox="0 0 433 882" preserveAspectRatio="xMidYMid meet" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label={alt} {...props}>
      {/* Outer frame and side buttons */}
      <path d="M2 73C2 32.6832 34.6832 0 75 0H357C397.317 0 430 32.6832 430 73V809C430 849.317 397.317 882 357 882H75C34.6832 882 2 849.317 2 809V73Z" fill="#404040"/>
      <path d="M0 171C0 170.448 0.447715 170 1 170H3V204H1C0.447715 204 0 203.552 0 203V171Z" fill="#404040"/>
      <path d="M1 234C1 233.448 1.44772 233 2 233H3.5V300H2C1.44772 300 1 299.552 1 299V234Z" fill="#404040"/>
      <path d="M1 319C1 318.448 1.44772 318 2 318H3.5V385H2C1.44772 385 1 384.552 1 384V319Z" fill="#404040"/>
      <path d="M430 279H432C432.552 279 433 279.448 433 280V384C433 384.552 432.552 385 432 385H430V279Z" fill="#404040"/>
      {/* Inner body */}
      <path d="M6 74C6 35.3401 37.3401 4 76 4H356C394.66 4 426 35.3401 426 74V808C426 846.66 394.66 878 356 878H76C37.3401 878 6 846.66 6 808V74Z" fill="#262626"/>
      <path opacity="0.5" d="M174 5H258V5.5C258 6.60457 257.105 7.5 256 7.5H176C174.895 7.5 174 6.60457 174 5.5V5Z" fill="#404040"/>
      {/* Screen */}
      <path d="M21.25 75C21.25 44.2101 46.2101 19.25 77 19.25H355C385.79 19.25 410.75 44.2101 410.75 75V807C410.75 837.79 385.79 862.75 355 862.75H77C46.2101 862.75 21.25 837.79 21.25 807V75Z" fill="#111"/>
      {/* An SVG image, not foreignObject: Safari draws foreignObject content unscaled, which blew the screen up on iPhones */}
      {src && <image href={src} x="21.25" y="19.25" width="389.5" height="843.5" preserveAspectRatio="xMidYMin slice" clipPath={`url(#${clip})`}/>}
      {/* Dynamic island */}
      <path d="M154 48.5C154 38.2827 162.283 30 172.5 30H259.5C269.717 30 278 38.2827 278 48.5C278 58.7173 269.717 67 259.5 67H172.5C162.283 67 154 58.7173 154 48.5Z" fill="#262626"/>
      <path d="M249 48.5C249 42.701 253.701 38 259.5 38C265.299 38 270 42.701 270 48.5C270 54.299 265.299 59 259.5 59C253.701 59 249 54.299 249 48.5Z" fill="#111"/>
      <path d="M254 48.5C254 45.4624 256.462 43 259.5 43C262.538 43 265 45.4624 265 48.5C265 51.5376 262.538 54 259.5 54C256.462 54 254 51.5376 254 48.5Z" fill="rgb(255 255 255 / 0.3)"/>
      <defs><clipPath id={clip}><rect x="21.25" y="19.25" width="389.5" height="843.5" rx="55.75" ry="55.75"/></clipPath></defs>
    </svg>
  </div>;
};

export interface HeroAction { label: string; onClick: () => void; icon?: LucideIcon; /** Put the icon after the label (an arrow). */ trailing?: boolean; }
export interface HeroSection6Props {
  title: ReactNode;
  text?: ReactNode;
  /** A short line above the title, e.g. the orange "ถึงตาคุณ" when it is the person's turn. */
  badge?: ReactNode;
  /** Paint the badge in the "your turn" orange. */
  turn?: boolean;
  primary: HeroAction;
  secondary?: HeroAction;
  /** A photo of the work for the wide frame (`position` is its CSS object-position), and an app screen for the iPhone. */
  photo: { src: string; alt: string; position?: string };
  phone: { src: string; alt: string };
  /** Which side of the photo the phone stands on: the side away from the person in the photo. */
  phoneSide?: 'left' | 'right';
  /** The public page's own bar (logo, links, sign in). Signed-in pages already have the app's bar. */
  nav?: ReactNode;
  /** "page" fills the window; "app" fills what is left under the app's bars and bleeds to its edges. */
  variant?: 'page' | 'app';
  className?: string;
}

const textVariants: Variants = {
  hidden: { opacity: 0, filter: 'blur(10px)', y: 20 },
  visible: { opacity: 1, filter: 'blur(0px)', y: 0, transition: { type: 'spring', bounce: 0.2, duration: 1 } },
};

/**
 * hero-section-6 for AirClean: a full-screen opening with the headline and the one action that matters, then a
 * photo of a technician at work with the app on a phone in front of it, rising out of a white-to-vest-blue glow.
 */
export default function HeroSection6({ title, text, badge, turn, primary, secondary, photo, phone, phoneSide = 'right', nav, variant = 'page', className }: HeroSection6Props) {
  const Primary = primary.icon, Secondary = secondary?.icon;
  // Inside the app the bar above already holds the page's h1.
  const Title = variant === 'app' ? 'h2' : 'h1';
  return <MotionConfig reducedMotion="user">
    <section className={cn('hx relative w-full overflow-hidden', variant === 'app' ? 'is-app' : 'is-page', className)}>
      <div className="hx-glow absolute inset-0 z-0" aria-hidden="true"/>
      {nav && <div className="relative z-10">{nav}</div>}

      <div className="hx-body relative z-10 mx-auto flex max-w-7xl flex-col items-center px-4 text-center">
        <AnimatedGroup className="mx-auto flex max-w-3xl flex-col items-center text-center" variants={{ container: { visible: { transition: { staggerChildren: 0.1 } } }, item: textVariants }}>
          {badge ? <div className={'hx-badge' + (turn ? ' is-turn' : '')}>{badge}</div> : null}
          <Title className="hx-title">{title}</Title>
          {text ? <p className="hx-text">{text}</p> : null}
          <div className="hx-actions">
            <button type="button" className="hx-btn is-primary" onClick={primary.onClick}>{Primary && !primary.trailing && <Primary size={20} aria-hidden="true"/>}{primary.label}{Primary && primary.trailing && <Primary size={20} aria-hidden="true"/>}</button>
            {secondary && <button type="button" className="hx-btn" onClick={secondary.onClick}>{Secondary && !secondary.trailing && <Secondary size={19} aria-hidden="true"/>}{secondary.label}{Secondary && secondary.trailing && <Secondary size={19} aria-hidden="true"/>}</button>}
          </div>
        </AnimatedGroup>

        {/* The work and the app: a photo, a phone in front of it, fading into the page */}
        <div className={'hx-shots relative z-20 mx-auto is-phone-' + phoneSide}>
          <motion.div initial={{ opacity: 0, y: 30, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.8, delay: 0.4, ease: 'easeOut' }}
            className="hx-photo relative w-full overflow-hidden">
            <img src={photo.src} alt={photo.alt} style={{ objectPosition: photo.position ?? 'center' }} decoding="async"/>
          </motion.div>
          <div className="hx-phone absolute">
            <motion.div initial={{ opacity: 0, scale: 0.8, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.7, ease: 'easeOut' }}>
              <Iphone15Pro src={phone.src} alt={phone.alt} className="w-full"/>
            </motion.div>
          </div>
        </div>
      </div>
      <div className="hx-fade pointer-events-none absolute right-0 bottom-0 left-0 z-30" aria-hidden="true"/>
    </section>
  </MotionConfig>;
}
