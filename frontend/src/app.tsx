import 'styles/app.css';
import { createRoot } from 'react-dom/client';
import DocumentContainer from 'containers/DocumentContainer';

const container = document.getElementById('app');
const root = createRoot(container);

root.render(<DocumentContainer />);
