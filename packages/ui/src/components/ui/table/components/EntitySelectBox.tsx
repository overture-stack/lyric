import { SchemasDictionary } from '@overture-stack/lyric';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../select/select';

type EntitySelectBoxType = {
	dictionary: SchemasDictionary;
	placeholder?: string;
};

const EntitySelectBox = ({ dictionary, placeholder = 'Select an entity...' }: EntitySelectBoxType) => {
	const entites = dictionary.schemas;

	return (
		<Select>
			<SelectTrigger>
				<SelectValue placeholder={placeholder} />
			</SelectTrigger>
			<SelectContent>
				{entites.map((entity) => (
					<SelectItem key={entity.name} value={entity.name.toLowerCase()}>
						{entity.name}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
};

export default EntitySelectBox;
