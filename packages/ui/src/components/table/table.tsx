import type { ColumnDef } from '@tanstack/react-table';
import { tableFeatures, useTable } from '@tanstack/react-table';

// 1. Define the shape of your data
type Person = {
	firstName: string;
	lastName: string;
	age: number;
};

// 2. Give your data a stable reference (module scope, useState, useQuery, etc.)
const data: Array<Person> = [
	{ firstName: 'tanner', lastName: 'linsley', age: 24 },
	{ firstName: 'tandy', lastName: 'miller', age: 40 },
	{ firstName: 'joe', lastName: 'dirte', age: 45 },
];

// 3. New in v9: declare which features this table uses (none yet)
const features = tableFeatures({});

// 4. Define your columns
const columns: Array<ColumnDef<typeof features, Person>> = [
	{
		accessorKey: 'firstName', // accessorKey shorthand
		header: 'First Name',
		cell: (info) => info.getValue(),
	},
	{
		accessorFn: (row) => row.lastName, // accessorFn alternative with a custom id
		id: 'lastName',
		header: () => <span>Last Name</span>,
		cell: (info) => <i>{info.getValue<string>()}</i>,
	},
	{
		accessorKey: 'age',
		header: () => 'Age',
	},
];

export type TableTypes<T> = {};

export function OverviewTable() {
	// 5. Create the table instance
	const table = useTable({
		key: 'person-table', // needed for devtools, omit if you don't want to use the devtools
		features,
		columns,
		data,
	});

	// 6. Render markup from the table instance APIs
	return (
		<table>
			<thead>
				{table.getHeaderGroups().map((headerGroup) => (
					<tr key={headerGroup.id}>
						{headerGroup.headers.map((header) => (
							<th key={header.id}>{header.isPlaceholder ? null : <table.FlexRender header={header} />}</th>
						))}
					</tr>
				))}
			</thead>
			<tbody>
				{table.getRowModel().rows.map((row) => (
					<tr key={row.id}>
						{row.getAllCells().map((cell) => (
							<td key={cell.id}>
								<table.FlexRender cell={cell} />
							</td>
						))}
					</tr>
				))}
			</tbody>
		</table>
	);
}
