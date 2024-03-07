export type MenuType = {
    name: string;
    link: string;
    host: string;
    children: {
        name: string;
        link: string;
        children: {
            name: string;
            link: string;
        }[];
    }[];
};
