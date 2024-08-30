import React, { useState, useEffect } from 'react';
import './App.css';
import Header from './Header';
import Footer from './Footer';

function App() {
  const [botStatus, setBotStatus] = useState({ isBotUp: false, botName: '', guilds: [] });

  const botImageUp = 'https://i1.sndcdn.com/artworks-nSOgrVzKLAJe0Kod-IpWrCw-t500x500.jpg';
  const botImageDown = 'https://www.freeiconspng.com/uploads/error-icon-4.png';

  // Use the environment variable for API endpoint
  const apiEndpoint = process.env.REACT_APP_API_URL || 'http://127.0.0.1:3003';
  console.log(`API Endpoint: ${apiEndpoint}`);  // Debugging line

  useEffect(() => {
    alert(`API Endpoint is: ${apiEndpoint}`);  // Display API endpoint in an alert for debugging

    fetch(`${apiEndpoint}/bot/logins`)
      .then(response => response.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          const botLoginEvents = data.filter(event => event.event_type === 'bot_login');
          const latestEvent = botLoginEvents[botLoginEvents.length - 1];
          const eventData = JSON.parse(latestEvent.event_data);
          const guilds = eventData.guilds.map(guild => guild.name.trim());

          setBotStatus({
            isBotUp: true,
            botName: eventData.botName || 'Unknown Bot',
            guilds: guilds
          });
        } else {
          setBotStatus({
            isBotUp: false,
            botName: 'Unknown Bot',
            guilds: []
          });
        }
      })
      .catch(error => {
        console.error('Error fetching bot status:', error);
        setBotStatus({
          isBotUp: false,
          botName: 'Unknown Bot',
          guilds: []
        });
      });
  }, [apiEndpoint]);

  useEffect(() => {
    document.title = botStatus.botName ? `${botStatus.botName} Bot Dashboard` : '';
  }, [botStatus.botName]);

  const botImage = botStatus.isBotUp ? botImageUp : botImageDown;

  return (
    <div className="App">
      <Header />
      <div className="container">
        <div className="picture-container">
          <img src={botImage} alt="Bot" />
        </div>
        <div className={`status-line ${botStatus.isBotUp ? 'up' : 'down'}`}>
          {botStatus.isBotUp ? `${botStatus.botName} is Online ✅` : `${botStatus.botName} is Offline ❌🤖`}
        </div>
        <div className="guild-name">
          {botStatus.isBotUp && botStatus.guilds.length > 0 && (
            <div>
              {botStatus.guilds.map((guildName, index) => (
                <div key={index} className="guild-item">➡️ {guildName}</div>
              ))}
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}

export default App;
