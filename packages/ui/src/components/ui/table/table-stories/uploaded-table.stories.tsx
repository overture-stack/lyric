import { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';

import { Button } from '../../button.js';
import { UploadedSubmissionTable } from '../UploadedSubmissionTable.js';
import { testDictionary, validatedResponse } from '../utils/mock.js';
import { FILE_ACTION, FileActionType } from '../utils/types.js';

const meta: Meta<typeof UploadedSubmissionTable> = {
	title: 'Components/UploadedSubmissionTable',
	component: UploadedSubmissionTable,
	tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof UploadedSubmissionTable>;

export const NewSubmissionControlled: Story = {
	render: () => {
		const [files, setFiles] = useState<FileActionType[]>([]);

		const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
			if (event.target.files && event.target.files.length > 0) {
				setFiles((prev) => [
					...prev,
					...Array.from(event.target.files ?? []).map((file) => ({
						id: file.name,
						fileName: file.name,
						action: FILE_ACTION.UPLOAD,
						selectedEntity: '',
						file,
					})),
				]);
			}
		};

		const deleteHandler = (id: number | string) => {
			// TODO: put request to remove selected field
			console.log('DELETE---', id);
		};
		const downloadFileHandler = (id: number | string) => {
			// TODO: endpoint to download by filename
			console.log('DOWNLOAD---', id);
		};
		const downloadErrorFileHandler = (id: number | string) => {
			// TODO: endpoint to download error for specific by file
			console.log('DOWNLOAD-ERROR---', id);
		};
		const changeEntityHandler = (id: number | string, entity: string) => {
			// TODO: endpoint to download error for specific by file
			console.log('CHANGE-ENTITY--', id, entity);
		};

		const onValidateHandler = () => {
			console.log('upload---', files);
		};

		return (
			<div className="flex flex-col gap-4">
				<UploadedSubmissionTable
					dictionary={testDictionary}
					fileActions={files}
					handlers={{
						deleteHandler,
						downloadFileHandler,
						downloadErrorFileHandler,
						changeEntityHandler,
					}}
				/>
				<input type="file" onChange={handleFileChange} accept="image/*,.pdf,.txt,.csv,.tsv" />
				<div className="w-30">
					<Button onClick={onValidateHandler}>Validate</Button>
				</div>
			</div>
		);
	},
};

export const WithExistingSubmissionControlled: Story = {
	render: () => {
		const [files, setFiles] = useState<FileActionType[]>([]);

		const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
			if (event.target.files && event.target.files.length > 0) {
				setFiles((prev) => [
					...prev,
					...Array.from(event.target.files ?? []).map((file) => ({
						id: file.name,
						fileName: file.name,
						action: FILE_ACTION.UPLOAD,
						selectedEntity: '',
						file,
					})),
				]);
			}
		};

		const deleteHandler = (id: number | string) => {
			// TODO: put request to remove selected field
			console.log('DELETE---', id);
		};
		const downloadFileHandler = (id: number | string) => {
			// TODO: endpoint to download by filename
			console.log('DOWNLOAD---', id);
		};
		const downloadErrorFileHandler = (id: number | string) => {
			// TODO: endpoint to download error for specific by file
			console.log('DOWNLOAD-ERROR---', id);
		};
		const changeEntityHandler = (id: number | string, entity: string) => {
			// TODO: endpoint to download error for specific by file
			console.log('CHANGE-ENTITY--', id, entity);
		};

		const onValidateHandler = () => {
			console.log('upload---', files);
		};

		return (
			<div className="flex flex-col gap-4">
				<UploadedSubmissionTable
					dictionary={testDictionary}
					submissionResponse={validatedResponse}
					fileActions={files}
					handlers={{
						deleteHandler,
						downloadFileHandler,
						downloadErrorFileHandler,
						changeEntityHandler,
					}}
				/>
				<input type="file" onChange={handleFileChange} accept="image/*,.pdf,.txt,.csv,.tsv" />
				<div className="w-30">
					<Button onClick={onValidateHandler}>Validate</Button>
				</div>
			</div>
		);
	},
};
