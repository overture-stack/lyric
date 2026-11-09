import { CircleCheck, Download, FileExclamationPoint, Trash } from 'lucide-react';

import { SubmissionStatus } from '@overture-stack/lyric';

import { Button } from '../../button';
import { ApiHandlers } from '../utils/types';

const DisplayRowAction = (
	id: number | string,
	status: SubmissionStatus,
	disabled: boolean,
	apiHandlers: ApiHandlers,
) => {
	switch (status) {
		case 'VALID':
		case 'VALIDATING':
		case 'COMMITTING':
			return (
				<div className="flex gap-2 items-center">
					<Button
						className="cursor-pointer"
						onClick={() => apiHandlers.deleteHandler(id)}
						disabled={disabled}
						variant={'outline'}
						icon={<Trash />}
						size={'xs'}
					>
						{'Remove'}
					</Button>
				</div>
			);
		case 'INVALID':
			return (
				<div className="flex gap-2 items-center">
					<Button
						className="cursor-pointer"
						onClick={() => apiHandlers.deleteHandler(id)}
						disabled={disabled}
						variant={'outline'}
						icon={<Trash />}
						size={'xs'}
					>
						{'Remove'}
					</Button>
					<Button
						className="cursor-pointer"
						onClick={() => apiHandlers.downloadErrorFileHandler(id)}
						disabled={disabled}
						variant={'outline'}
						icon={<FileExclamationPoint />}
						size={'xs'}
					>
						{'Error Report'}
					</Button>
					<Button
						className="cursor-pointer"
						onClick={() => apiHandlers.downloadFileHandler(id)}
						disabled={disabled}
						variant={'outline'}
						icon={<Download />}
						size={'xs'}
					>
						{'Download File'}
					</Button>
				</div>
			);
		default:
			return (
				<div>
					<CircleCheck />
				</div>
			);
	}
};

export default DisplayRowAction;
