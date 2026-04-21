const cheerio = require('cheerio');
const axios = require('axios');

async function test() {
  try {
    const r1 = await axios.get('https://4khdhub.dad/?s=deadpool');
    const $1 = cheerio.load(r1.data);
    const movieUrl = $1('.movie-card').first().attr('href');
    if (!movieUrl) return console.log('No movie found');
    
    console.log('Movie URL:', movieUrl);
    const r2 = await axios.get('https://4khdhub.dad' + movieUrl);
    const $2 = cheerio.load(r2.data);
    
    const hubcloudLink = $2('.download-item a').filter((i, el) => $2(el).text().includes('HubDrive')).first().attr('href');
    console.log('HubDrive link:', hubcloudLink);
    
    const rot13Cipher = require('rot13-cipher');
    const r3 = await axios.get(hubcloudLink);
    const redirectDataMatch = r3.data.match(/'o','(.*?)'/);
    const redirectData = JSON.parse(atob(rot13Cipher(atob(atob(redirectDataMatch[1])))));
    
    const hubdriveUrl = atob(redirectData['o']);
    console.log('Decrypted:', hubdriveUrl);
    
    const r4 = await axios.get(hubdriveUrl);
    const $4 = cheerio.load(r4.data);
    const hcUrl = $4('a:contains("HubCloud")').attr('href');
    console.log('HubCloud link from HubDrive:', hcUrl);
    
    const r5 = await axios.get(hcUrl);
    const redirectUrlMatch = r5.data.match(/var url ?= ?'(.*?)'/);
    console.log('Redirect url match:', redirectUrlMatch ? redirectUrlMatch[1] : 'NOT FOUND');
    
    if (redirectUrlMatch) {
      const r6 = await axios.get(redirectUrlMatch[1], { headers: { Referer: hcUrl } });
      const $6 = cheerio.load(r6.data);
      const links6 = [];
      $6('a').each((i, el) => links6.push({ text: $6(el).text().trim(), href: $6(el).attr('href') }));
      const fslLink = links6.find(l => l.text.includes('FSL')).href;
      console.log('FSL link:', fslLink);
      try {
        const r7 = await axios.head(fslLink);
        console.log('FSL HEAD status:', r7.status);
        console.log('FSL HEAD content-type:', r7.headers['content-type']);
        console.log('FSL HEAD access-control-allow-origin:', r7.headers['access-control-allow-origin']);
      } catch(e) {
        console.log('FSL HEAD error:', e.message);
      }
    }
  } catch(e) { console.error(e.message); }
}
test();
