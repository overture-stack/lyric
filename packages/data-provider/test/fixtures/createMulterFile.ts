import { Readable } from 'stream';

export function createMulterFile(params: { filename?: string; originalname?: string }): Express.Multer.File {
	return {
		originalname: params.originalname ?? '',
		filename: params.filename ?? '',

		buffer: Buffer.alloc(0),
		destination: '',
		encoding: '',
		fieldname: '',
		mimetype: '',
		path: '',
		size: 0,
		stream: new Readable(),
	};
}
