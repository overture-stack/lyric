import type { Meta, StoryObj } from '@storybook/react';
import * as React from 'react';

import {
	Combobox,
	ComboboxChip,
	ComboboxChips,
	ComboboxChipsInput,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxGroup,
	ComboboxInput,
	ComboboxItem,
	ComboboxLabel,
	ComboboxList,
	ComboboxSeparator,
	useComboboxAnchor,
} from './combobox';

const meta: Meta<typeof Combobox> = {
	title: 'Components/Combobox',
	component: Combobox,
	tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof Combobox>;

const fruits = ['Apple', 'Banana', 'Cherry', 'Date', 'Elderberry', 'Fig', 'Grape'] as const;

const groupedFruits = {
	Tropical: ['Mango', 'Papaya', 'Pineapple', 'Guava'],
	Citrus: ['Lemon', 'Lime', 'Orange', 'Grapefruit'],
};

export const Default: Story = {
	render: () => (
		<Combobox items={fruits}>
			<ComboboxInput placeholder="Select a fruit" />
			<ComboboxContent>
				<ComboboxEmpty>No items found.</ComboboxEmpty>
				<ComboboxList>
					{(item) => (
						<ComboboxItem key={item} value={item}>
							{item}
						</ComboboxItem>
					)}
				</ComboboxList>
			</ComboboxContent>
		</Combobox>
	),
};

export const Placeholder: Story = {
	render: () => (
		<Combobox items={fruits}>
			<ComboboxInput placeholder="Search fruit..." />
			<ComboboxContent>
				<ComboboxEmpty>No items found.</ComboboxEmpty>
				<ComboboxList>
					{(item) => (
						<ComboboxItem key={item} value={item}>
							{item}
						</ComboboxItem>
					)}
				</ComboboxList>
			</ComboboxContent>
		</Combobox>
	),
};

export const WithClear: Story = {
	render: () => (
		<Combobox items={fruits} defaultValue="Cherry">
			<ComboboxInput placeholder="Search fruit..." showClear />
			<ComboboxContent>
				<ComboboxEmpty>No items found.</ComboboxEmpty>
				<ComboboxList>
					{(item) => (
						<ComboboxItem key={item} value={item}>
							{item}
						</ComboboxItem>
					)}
				</ComboboxList>
			</ComboboxContent>
		</Combobox>
	),
};

export const EmptyState: Story = {
	render: () => (
		<Combobox items={fruits}>
			<ComboboxInput placeholder="Try typing something unusual..." />
			<ComboboxContent>
				<ComboboxEmpty>No results found.</ComboboxEmpty>
				<ComboboxList>
					{(item) => (
						<ComboboxItem key={item} value={item}>
							{item}
						</ComboboxItem>
					)}
				</ComboboxList>
			</ComboboxContent>
		</Combobox>
	),
};

export const Grouped: Story = {
	render: () => (
		<Combobox>
			<ComboboxInput placeholder="Search fruit..." />
			<ComboboxContent>
				<ComboboxList>
					{Object.entries(groupedFruits).map(([label, items], idx, arr) => (
						<React.Fragment key={label}>
							<ComboboxGroup>
								<ComboboxLabel>{label}</ComboboxLabel>
								{items.map((fruit) => (
									<ComboboxItem key={fruit} value={fruit.toLowerCase()}>
										{fruit}
									</ComboboxItem>
								))}
							</ComboboxGroup>
							{idx < arr.length - 1 && <ComboboxSeparator />}
						</React.Fragment>
					))}
				</ComboboxList>
			</ComboboxContent>
		</Combobox>
	),
};

export const Disabled: Story = {
	render: () => (
		<Combobox items={fruits} defaultValue="Apple" disabled>
			<ComboboxInput placeholder="Search fruit..." disabled />
			<ComboboxContent>
				<ComboboxEmpty>No items found.</ComboboxEmpty>
				<ComboboxList>
					{(item) => (
						<ComboboxItem key={item} value={item}>
							{item}
						</ComboboxItem>
					)}
				</ComboboxList>
			</ComboboxContent>
		</Combobox>
	),
};

export const WithDisabledItem: Story = {
	render: () => (
		<Combobox items={fruits}>
			<ComboboxInput placeholder="Search fruit..." />
			<ComboboxContent>
				<ComboboxEmpty>No items found.</ComboboxEmpty>
				<ComboboxList>
					{(item) => (
						<ComboboxItem key={item} value={item} disabled={item === 'Date'}>
							{item}
						</ComboboxItem>
					)}
				</ComboboxList>
			</ComboboxContent>
		</Combobox>
	),
};

export const MultiSelect: Story = {
	render: () => {
		const [values, setValues] = React.useState<string[]>(['Apple', 'Cherry']);
		const anchorRef = useComboboxAnchor();

		return (
			<Combobox multiple items={fruits} value={values} onValueChange={setValues}>
				<ComboboxChips ref={anchorRef}>
					{values.map((val) => (
						<ComboboxChip key={val}>{val}</ComboboxChip>
					))}
					<ComboboxChipsInput placeholder="Search fruit..." />
				</ComboboxChips>
				<ComboboxContent anchor={anchorRef}>
					<ComboboxEmpty>No results found.</ComboboxEmpty>
					<ComboboxList>
						{(item) => (
							<ComboboxItem key={item} value={item}>
								{item}
							</ComboboxItem>
						)}
					</ComboboxList>
				</ComboboxContent>
			</Combobox>
		);
	},
};

export const Controlled: Story = {
	render: () => {
		const [value, setValue] = React.useState<string>('Grape');

		return (
			<div className="flex flex-col gap-4">
				<Combobox items={fruits} value={value} onInputValueChange={(e) => setValue(e)}>
					<ComboboxInput placeholder="Search fruit..." showClear />
					<ComboboxContent>
						<ComboboxEmpty>No items found.</ComboboxEmpty>
						<ComboboxList>
							{(item) => (
								<ComboboxItem key={item} value={item}>
									{item}
								</ComboboxItem>
							)}
						</ComboboxList>
					</ComboboxContent>
				</Combobox>
				<p className="text-sm text-muted-foreground">
					Selected: <span className="font-medium text-foreground">{value || '—'}</span>
				</p>
				<button className="w-fit text-sm underline" onClick={() => setValue('Fig')}>
					Set to "Fig" programmatically
				</button>
			</div>
		);
	},
};
