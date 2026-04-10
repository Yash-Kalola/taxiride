'use client';
import { clsx } from 'clsx';
import { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  primary:   'bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 active:bg-indigo-800 focus-visible:ring-indigo-500',
  secondary: 'bg-white text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 active:bg-gray-100 focus-visible:ring-indigo-500',
  danger:    'bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-800 focus-visible:ring-red-500',
  ghost:     'text-gray-600 hover:bg-gray-100 hover:text-gray-900 active:bg-gray-200 focus-visible:ring-indigo-500',
};

const sizes: Record<Size, string> = {
  sm: 'h-8  px-3   text-xs  gap-1.5 rounded-md',
  md: 'h-9  px-4   text-sm  gap-2   rounded-lg',
  lg: 'h-11 px-5   text-sm  gap-2   rounded-lg',
};

export default function Button({
  variant = 'secondary',
  size = 'md',
  className,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled}
      className={clsx(
        'inline-flex items-center justify-center font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
        variants[variant],
        sizes[size],
        disabled && 'pointer-events-none opacity-50',
        className
      )}
    >
      {children}
    </button>
  );
}
