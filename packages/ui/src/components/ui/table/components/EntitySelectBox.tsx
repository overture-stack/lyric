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
		<div className="w-full pr-2">
			<Select disabled={disabled}>
				<SelectTrigger className="w-full">
					<SelectValue placeholder={placeholder} />
				</SelectTrigger>
				<SelectContent>
					{entites.map((entity) => (
						<SelectItem key={entity.name} value={entity.name.toLowerCase()} className="w-full">
							{entity.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
};

export default EntitySelectBox;
