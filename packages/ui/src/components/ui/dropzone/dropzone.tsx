import { clsx } from 'cn';
import * as React from 'react';
import ReactDropzone, { DropzoneProps as ReactDropzoneProps, DropzoneRef } from 'react-dropzone';

import FileAdd from '@/icons/FileAdd';

import { Button } from '../button';

export interface DropzoneProps extends ReactDropzoneProps {
	buttonText?: string;
	className?: string;
	instructionsText?: string;
}

const dropzoneClassName = 'border-gray-300 border-dashed border-2 bg-gray-50 text-base p-5';

const Dropzone = React.forwardRef<HTMLDivElement, DropzoneProps>(
	({ buttonText, className, disabled, instructionsText, ...props }, ref) => {
		const dropzoneRef = React.useRef<DropzoneRef>(null);
		return (
			<div className={clsx(dropzoneClassName, className, disabled && 'opacity-15')} ref={ref}>
				<ReactDropzone ref={dropzoneRef} noClick noKeyboard disabled={disabled} {...props}>
					{({ getRootProps, getInputProps }) => (
						<div {...getRootProps({ className: 'react-dropzone' })}>
							<input {...getInputProps()} />
							<div className="flex flex-wrap justify-center w-100 items-center mx-auto gap-4">
								<div>{instructionsText}</div>
								<Button variant="white" onClick={() => dropzoneRef.current?.open()} icon={<FileAdd />}>
									{buttonText}
								</Button>
							</div>
						</div>
					)}
				</ReactDropzone>
			</div>
		);
	},
);
Dropzone.displayName = 'Dropzone';

export { Dropzone };
