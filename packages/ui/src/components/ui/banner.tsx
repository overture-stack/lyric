import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';
import { X } from 'lucide-react';
import * as React from 'react';

import ErrorIcon from '@/icons/ErrorIcon';
import InfoIcon from '@/icons/InfoIcon';
import SuccessIcon from '@/icons/SuccessIcon';
import WarningIcon from '@/icons/WarningIcon';

const bannerVariants = cva('z-50 flex justify-between w-full py-5 px-6 font-normal text-body', {
	variants: {
		variant: {
			error: 'bg-rose-100 text-red-600',
			info: 'bg-blue-100 text-sky-800',
			success: 'bg-lime-50 text-green-500',
			warning: 'bg-amber-50 text-amber-400',
		},
	},
	defaultVariants: {
		variant: 'error',
	},
});

const variantIcons = {
	error: <ErrorIcon />,
	info: <InfoIcon />,
	success: <SuccessIcon />,
	warning: <WarningIcon />,
};

export interface BannerProps extends React.ComponentProps<'div'>, VariantProps<typeof bannerVariants> {
	bannerDescription?: React.ReactNode;
	bannerTitle: React.ReactNode;
	dismissButtonClick?: () => void;
	dismissButtonLabel?: string;
	dismissible?: boolean;
	variantLabel?: string;
}

const Banner = React.forwardRef<HTMLDivElement, BannerProps>(
	({
		bannerDescription,
		bannerTitle,
		className,
		dismissButtonClick,
		dismissButtonLabel,
		dismissible,
		variant,
		variantLabel,
		...props
	}) => {
		const Icon = variant && variantIcons[variant];

		return (
			<div tabIndex={-1} className={cn(bannerVariants({ variant, className }))} {...props}>
				<div className="flex-col">
					<div className="flex items-center">
						<div className="w-6 mr-2">
							{Icon} {variantLabel && <span className="sr-only">{variantLabel}</span>}
						</div>
						<span className="text-lg text-black">{bannerTitle}</span>
					</div>
					{bannerDescription && <div className="mt-1 ml-8 text-black">{bannerDescription}</div>}
				</div>
				{dismissible && (
					<div className="flex items-center">
						<button
							type="button"
							className="shrink-0 inline-flex justify-center w-7 h-7 items-center  cursor-pointer opacity-45 text-black"
							onClick={dismissButtonClick}
						>
							<X className="w-4 h-4" />
							{dismissButtonLabel && <span className="sr-only">{dismissButtonLabel}</span>}
						</button>
					</div>
				)}
			</div>
		);
	},
);
Banner.displayName = 'Banner';

export { Banner, bannerVariants };
