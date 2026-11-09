import { CircleCheck, Info, TriangleAlert } from 'lucide-react';

import { SubmissionStatus } from '@overture-stack/lyric';

const DisplayRowStatus = (status: SubmissionStatus, error?: string) => {
	switch (status) {
		case 'VALID':
		case 'VALIDATING':
		case 'COMMITTING':
			return (
				<div className="flex gap-2 items-center">
					<CircleCheck size={15} className="text-green-500" />
					<p>{'Ready for validation'}</p>
				</div>
			);
		case 'COMMITTED':
			return (
				<div className="flex gap-2 items-center">
					<Info size={15} className="text-gray-[#3D7CA4]" />
					<p>{'Commited'}</p>
				</div>
			);
		case 'INVALID':
			return (
				<div className="flex gap-2 items-center">
					<TriangleAlert size={15} className="text-red-500" />
					<p>{error ?? 'ERROR'}</p>
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

export default DisplayRowStatus;
