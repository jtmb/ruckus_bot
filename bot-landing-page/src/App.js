import React, { useState, useEffect } from 'react';
import './App.css';
import Header from './Header'; // Import Header component
import Footer from './Footer'; // Import Footer component

function App() {
  const [botStatus, setBotStatus] = useState({ isBotUp: false, guildName: '', botName: '' });
  const botImage = 'https://i1.sndcdn.com/artworks-nSOgrVzKLAJe0Kod-IpWrCw-t500x500.jpg';

  useEffect(() => {
    // Fetch bot status from the updated API
    fetch('http://localhost:3001/bot/logins')
      .then(response => response.json())
      .then(data => {
        // Check if the data array is not empty
        if (Array.isArray(data) && data.length > 0) {
          // Get the latest event
          const latestEvent = data[data.length - 1];
          // Check if the latest event is a bot_login event
          if (latestEvent.event_type === 'bot_login') {
            const eventData = JSON.parse(latestEvent.event_data);
            setBotStatus({
              isBotUp: true,
              guildName: eventData.guildName || 'Unknown Guild',
              botName: eventData.botName || 'Unknown Bot'
            });
          } else {
            setBotStatus({
              isBotUp: false,
              guildName: 'Unknown Guild',
              botName: 'Unknown Bot'
            });
          }
        } else {
          setBotStatus({
            isBotUp: false,
            guildName: 'Unknown Guild',
            botName: 'Unknown Bot'
          });
        }
      })
      .catch(error => {
        console.error('Error fetching bot status:', error);
        setBotStatus({
          isBotUp: false,
          guildName: 'Unknown Guild',
          botName: 'Unknown Bot'
        });
      });
  }, []);

  return (
    <div className="App">
      <Header />
      <div className="container">
        <div className="picture-container">
          <img src={botImage} alt="Bot" />
        </div>
        <div className={`status-line ${botStatus.isBotUp ? 'up' : 'down'}`}>
          {botStatus.isBotUp ? `${botStatus.botName} is Online ✅` : `${botStatus.botName} is Offline ❌`}
        </div>
        <div className="guild-name">
          {botStatus.isBotUp ? `Connected to: ➡️ ${botStatus.guildName}` : ''}
        </div>
      </div>
      <Footer />
    </div>
  );
}

export default App;
