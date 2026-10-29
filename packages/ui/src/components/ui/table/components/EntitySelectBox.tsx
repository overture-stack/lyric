import { SchemasDictionary } from '@overture-stack/lyric';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../select/select';

type EntitySelectBoxType = {
	dictionary: SchemasDictionary;
	placeholder?: string;
	disabled?: boolean;
};

// TODO: pass default value based off dictionary entity and submitted file name
const EntitySelectBox = ({
	dictionary,
	placeholder = 'Select an entity...',
	disabled = false,
}: EntitySelectBoxType) => {
	const entites = dictionary.schemas;

	return (
		<Select disabled={disabled}>
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
