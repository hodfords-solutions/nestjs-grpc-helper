const Header: FunctionComponent = () => {
  return (
    <header className="bg-athens border-snowflake flex h-20 items-center gap-6 border-b px-8 py-3">
      <img
        className="h-14 w-14 rounded-full object-cover"
        src="https://cdn.pixabay.com/photo/2015/05/17/10/51/facebook-770688_1280.png"
      />
      <div className="flex flex-col">
        <h2 className="text-onyx text-xl font-semibold">Documentation</h2>
        <span className="text-gunmetal text-lg leading-5 font-light">
          Microservice documents.
        </span>
      </div>
    </header>
  );
};

export default Header;
