import './styles/App.css'; // Adjust the path if necessary
import HeaderWrapper from './components/HeaderWrapper';
import Footer from './footer/page.js';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <HeaderWrapper />
        {children}
        <Footer />
      </body>
    </html>
  );
}
