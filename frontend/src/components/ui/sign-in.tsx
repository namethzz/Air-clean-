import { useEffect, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import './sign-in.css';

/*
 * Sign-in layout adapted from the 21st.dev "SignInPage" component: a form column on the left and a photo with
 * floating cards on the right (from 1024px wide; phones and portrait tablets get the form alone). The colours come from the shadcn-style tokens in index.css
 * (background, foreground, primary, …), which are mapped to AirClean's blue, so the component follows the brand.
 *
 * Used as is, it renders the original email + password form. Pass `children` to supply your own form instead;
 * AirClean's AuthPage does that because it also handles sign-up, roles, Apple sign-in and password resets.
 */

// --- HELPER COMPONENTS (ICONS) ---

export const GoogleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s12-5.373 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-2.641-.21-5.236-.611-7.743z" />
    <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
    <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
    <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C42.022 35.026 44 30.038 44 24c0-2.641-.21-5.236-.611-7.743z" />
  </svg>
);

// --- TYPE DEFINITIONS ---

/** A card floating over the photo. Give it an `avatarSrc` for a person's quote, or an `icon` for a product fact. */
export interface Testimonial {
  avatarSrc?: string;
  icon?: ReactNode;
  name: string;
  handle: string;
  text: string;
}

const defaultLabels = {
  email: 'อีเมล',
  emailPlaceholder: 'you@example.com',
  password: 'รหัสผ่าน',
  passwordPlaceholder: 'กรอกรหัสผ่าน',
  showPassword: 'แสดงรหัสผ่าน',
  hidePassword: 'ซ่อนรหัสผ่าน',
  rememberMe: 'จดจำการเข้าสู่ระบบ',
  resetPassword: 'ลืมรหัสผ่าน?',
  signIn: 'เข้าสู่ระบบ',
  orContinueWith: 'หรือดำเนินการต่อด้วย',
  google: 'ดำเนินการต่อด้วย Google',
  newHere: 'ยังไม่มีบัญชี?',
  createAccount: 'สมัครสมาชิก',
};

export interface SignInPageProps {
  title?: ReactNode;
  description?: ReactNode;
  heroImageSrc?: string;
  /** Describes the photo for screen readers; leave empty when it is only decoration. */
  heroAlt?: string;
  testimonials?: Testimonial[];
  onSignIn?: (event: FormEvent<HTMLFormElement>) => void;
  onGoogleSignIn?: () => void;
  onResetPassword?: () => void;
  onCreateAccount?: () => void;
  /** Logo and links shown above the title. */
  header?: ReactNode;
  /** Replaces the built-in form, social button and "create account" line. */
  children?: ReactNode;
  /** Shown under the form, e.g. legal links. */
  footer?: ReactNode;
  labels?: Partial<typeof defaultLabels>;
}

// --- SUB-COMPONENTS ---

/** The rounded field shell. Put an <input> (or an input plus a trailing button) inside. */
export const GlassInputWrapper = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn('ac-signin-field rounded-2xl border border-border bg-secondary transition-[border-color,background-color,box-shadow] duration-200 focus-within:border-primary focus-within:bg-background focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--primary)_16%,transparent)]', className)}>
    {children}
  </div>
);

/** A password input with a show / hide button, sized to sit inside GlassInputWrapper. */
export function PasswordInput({ showLabel = defaultLabels.showPassword, hideLabel = defaultLabels.hidePassword, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { showLabel?: string; hideLabel?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={visible ? 'text' : 'password'} className={cn('w-full bg-transparent p-4 pr-12 rounded-2xl focus:outline-none', className)} />
      <button type="button" onClick={() => setVisible(v => !v)} aria-label={visible ? hideLabel : showLabel} aria-pressed={visible}
        className="ac-signin-icon-button absolute inset-y-0 right-2 my-auto grid h-10 w-10 place-items-center rounded-xl text-muted-foreground transition-colors hover:text-foreground">
        {visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
      </button>
    </div>
  );
}

const TestimonialCard = ({ testimonial, delay }: { testimonial: Testimonial; delay: string }) => (
  <div className={`animate-testimonial ${delay} flex w-64 shrink-0 items-start gap-3 rounded-3xl border border-white/40 bg-white/75 p-5 shadow-[0_18px_40px_-18px_rgb(9_30_60/0.45)] backdrop-blur-xl`}>
    {testimonial.avatarSrc
      ? <img src={testimonial.avatarSrc} className="h-10 w-10 shrink-0 rounded-2xl object-cover" alt="" />
      : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground">{testimonial.icon}</span>}
    <div className="text-sm leading-snug">
      <p className="font-display font-semibold text-foreground">{testimonial.name}</p>
      <p className="text-muted-foreground">{testimonial.handle}</p>
      <p className="mt-1.5 text-foreground/80">{testimonial.text}</p>
    </div>
  </div>
);

// --- MAIN COMPONENT ---

export const SignInPage = ({
  title = 'ยินดีต้อนรับกลับมา',
  description = 'เข้าสู่ระบบเพื่อดำเนินการต่อ',
  heroImageSrc,
  heroAlt = '',
  testimonials = [],
  onSignIn,
  onGoogleSignIn,
  onResetPassword,
  onCreateAccount,
  header,
  children,
  footer,
  labels: labelOverrides,
}: SignInPageProps) => {
  const labels = { ...defaultLabels, ...labelOverrides };
  // The staggered entrance plays once. Fields that appear later (switching to sign-up, say) show at once.
  const [entered, setEntered] = useState(false);
  useEffect(() => { const timer = window.setTimeout(() => setEntered(true), 1200); return () => window.clearTimeout(timer); }, []);

  return (
    <div className="ac-signin flex min-h-[100dvh] w-full flex-col bg-background font-body text-foreground lg:flex-row" data-entered={entered || undefined}>
      {/* Left column: sign-in form */}
      <section className="ac-signin-form flex flex-1 justify-center px-5 py-6 sm:items-center sm:px-8 sm:py-10">
        <div className="w-full max-w-[440px]">
          <div className="flex flex-col gap-6">
            {header && <div className="animate-element">{header}</div>}
            <div className="flex flex-col gap-2.5">
              <h1 className="animate-element animate-delay-100 font-display text-[2rem] font-semibold leading-[1.15] tracking-[-0.02em] text-balance md:text-[2.5rem]">{title}</h1>
              <p className="animate-element animate-delay-200 text-[0.95rem] leading-relaxed text-pretty text-muted-foreground">{description}</p>
            </div>

            {children ?? <>
              <form className="space-y-5" onSubmit={onSignIn}>
                <label className="animate-element animate-delay-300 block">
                  <span className="mb-1.5 block text-sm font-medium text-foreground/80">{labels.email}</span>
                  <GlassInputWrapper>
                    <input name="email" type="email" autoComplete="email" placeholder={labels.emailPlaceholder} className="w-full bg-transparent p-4 rounded-2xl focus:outline-none" />
                  </GlassInputWrapper>
                </label>

                <label className="animate-element animate-delay-400 block">
                  <span className="mb-1.5 block text-sm font-medium text-foreground/80">{labels.password}</span>
                  <GlassInputWrapper>
                    <PasswordInput name="password" autoComplete="current-password" placeholder={labels.passwordPlaceholder} showLabel={labels.showPassword} hideLabel={labels.hidePassword} />
                  </GlassInputWrapper>
                </label>

                <div className="animate-element animate-delay-500 flex items-center justify-between text-sm">
                  <label className="flex cursor-pointer items-center gap-3">
                    <input type="checkbox" name="rememberMe" defaultChecked className="custom-checkbox" />
                    <span className="text-foreground/90">{labels.rememberMe}</span>
                  </label>
                  <button type="button" onClick={onResetPassword} className="ac-signin-link font-medium text-primary">{labels.resetPassword}</button>
                </div>

                <button type="submit" className="ac-signin-primary animate-element animate-delay-600 w-full rounded-2xl bg-primary py-4 font-medium text-primary-foreground transition-colors hover:bg-primary/90">
                  {labels.signIn}
                </button>
              </form>

              <div className="animate-element animate-delay-700 flex items-center gap-4 text-sm text-muted-foreground" role="separator">
                <span className="h-px flex-1 bg-border" />{labels.orContinueWith}<span className="h-px flex-1 bg-border" />
              </div>

              <button type="button" onClick={onGoogleSignIn} className="ac-signin-outline animate-element animate-delay-800 flex w-full items-center justify-center gap-3 rounded-2xl border border-border py-4 transition-colors hover:bg-secondary">
                <GoogleIcon />
                {labels.google}
              </button>

              <p className="animate-element animate-delay-900 text-center text-sm text-muted-foreground">
                {labels.newHere} <button type="button" onClick={onCreateAccount} className="ac-signin-link font-medium text-primary">{labels.createAccount}</button>
              </p>
            </>}

            {footer && <div className="animate-element animate-delay-900">{footer}</div>}
          </div>
        </div>
      </section>

      {/* Right column: hero image + cards (desktop only) */}
      {heroImageSrc && (
        <section className="relative hidden flex-1 p-4 lg:block">
          <div className="sticky top-4 h-[calc(100dvh-2rem)]">
            <div className="animate-slide-right animate-delay-300 absolute inset-0 overflow-hidden rounded-3xl bg-secondary">
              <img src={heroImageSrc} alt={heroAlt} aria-hidden={heroAlt ? undefined : true} className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_45%,rgb(19_37_59/0.55))]" />
            </div>
            {testimonials.length > 0 && (
              // Cards keep their width; a card shows only when the photo column (half the screen) has room for it.
              <div className="absolute inset-x-6 bottom-6 flex items-stretch justify-center gap-4">
                <TestimonialCard testimonial={testimonials[0]} delay="animate-delay-1000" />
                {testimonials[1] && <div className="hidden min-[1220px]:flex"><TestimonialCard testimonial={testimonials[1]} delay="animate-delay-1200" /></div>}
                {testimonials[2] && <div className="hidden min-[1780px]:flex"><TestimonialCard testimonial={testimonials[2]} delay="animate-delay-1400" /></div>}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
};

export default SignInPage;
