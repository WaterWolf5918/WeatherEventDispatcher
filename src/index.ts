/* eslint-disable @typescript-eslint/no-explicit-any */
import {EventEmitter} from 'node:events';
export interface Alert {
    event: string
    areas: string
    sender: string
    starts: Date
    ends: Date
    headline: string
    description: string
    ID: string
//description
}

class TypedEventEmitter<TEvents extends Record<string, any>> {
    private emitter = new EventEmitter();

    protected emit<TEventName extends keyof TEvents & string>(
        eventName: TEventName,
        ...eventArg: TEvents[TEventName]
    ) {
        this.emitter.emit(eventName, ...(eventArg as []));
    }
    on<TEventName extends keyof TEvents & string>(
        eventName: TEventName,
        handler: (...eventArg: TEvents[TEventName]) => void
    ) {
        this.emitter.on(eventName, handler as any);
    }

    off<TEventName extends keyof TEvents & string>(
        eventName: TEventName,
        handler: (...eventArg: TEvents[TEventName]) => void
    ) {
        this.emitter.off(eventName, handler as any);
    }
}

type LocalEventTypes = {
    'startUp': [
        {
            alerts:Alert[]
        }
    ],
    'currentAlerts': [
        {
            /**
            * List of active alerts.
            */
            alerts:Alert[]
        }
    ],
    'newAlerts': [
        {
            /**
            * List of new alerts.
            */
            newAlerts: Alert[]

            /**
            * List of active alerts before the new alerts.
            */
            pastAlerts: Alert[]

            /**
            * List of IDs that are no longer found.
            */
            rawDifference: string[]
        }
    ]
    'expiredAlerts': [
        {
            /**
            * List of expired alerts.
            */
            expiredAlerts: Alert[]

            /**
            * List of active alerts.
            */
            currentAlerts: Alert[]

            /**
            * List of IDs that are no longer found.
            */
            rawDifference: string[]
        }
    ],
    'noAlerts': []
}


export class WeatherEventDispatcher extends TypedEventEmitter<LocalEventTypes>{
    private county: string;
    private lastDisplayUpdate: number;
    private debug: boolean;
    constructor(cords: number[],county: string,debug=false){
        super();
        this.debug = debug;
        this.county = county;
        (async () => {
            const pointsUrl = `https://api.weather.gov/points/${cords[0]},${cords[1]}`;
            const countyCode = await this.getZoneByOffice(await this.getOffice(pointsUrl));
            let activeAlerts: Alert[] = [];
            let activeAlertsIDList = [];
            let firstStart = true;
            setInterval(async () => {
                let fetchURL = `https://api.weather.gov/alerts/active?zone=${countyCode}`;
                if(debug){fetchURL = 'http://localhost:8080/alerts';}

                fetch(fetchURL)
                    .then(response => response.json())
                    .then(alertsList => alertsList.features)
                    .then(alertsList => {
                        const alerts:Alert[] = [];
                        const alertsIDList = [];
                        alertsList.forEach(_alert => {
                            const alert = _alert.properties;
                            const areas = alert.areaDesc;
                            const starts = alert.effective;
                            const ends = alert.ends;
                            const event = alert.event;
                            const sender = alert.senderName;
                            const headline = alert.headline;
                            const description = alert.description;
                            const ID = alert.id;
                            const alertJSON = { areas, starts, ends, event, sender, headline, description, ID };
        
                            alerts.push(alertJSON);
                            alertsIDList.push(ID);
                        });
        
                        if (firstStart) {
                            activeAlertsIDList = alertsIDList;
                            activeAlerts = alerts;
                            this.emit('startUp',{alerts:activeAlerts});
                            firstStart = false;
                            return;
                        }
                        
                        if (activeAlertsIDList.join(',') == alertsIDList.join(',')) {
                            this.emit('currentAlerts',{alerts:activeAlerts});
                        }
                        else if (activeAlertsIDList.join(',') !== alertsIDList.join(',')) {
                            //Alert Don't Match
                            const tempArray = [...activeAlertsIDList, ...alertsIDList];
                            const difference = tempArray.filter(item =>
                                (activeAlertsIDList.includes(item) && !alertsIDList.includes(item)) ||
                                (alertsIDList.includes(item) && !activeAlertsIDList.includes(item))
                            );
        
                            if (alertsIDList.length < activeAlertsIDList.length) {
                                const expired = activeAlerts.filter(alert => difference.includes(alert.ID));
                                this.emit('expiredAlerts',{expiredAlerts: expired, currentAlerts: alerts, rawDifference: difference});
        
                            } else {
                                const newAlerts = alerts.filter(alert => difference.includes(alert.ID));
                                this.emit('newAlerts',{newAlerts: newAlerts, pastAlerts: activeAlerts, rawDifference: difference});
                            }
                        }
                        activeAlertsIDList = alertsIDList;
                        activeAlerts = alerts;
                    })
                    .catch(error => {
                        this.drawLineWithText('Something Went Wrong');
                        this.drawLineWithText('Error','-');
                        console.log(error);
                        this.drawLineWithText('End of Error','-');
                        console.log('');
                        return;
                    });
            }, 1000);
        })();
    }


    private async getOffice(pointsUrl) {
        console.log(pointsUrl);
        const gridPoint = await (await fetch(pointsUrl)).json();
        return gridPoint.properties.gridId;
    }

    private async getZoneByOffice(office) {
        let countyCode;
        const listOfZones = await (await fetch('https://api.weather.gov/offices/' + office)).json();
        for (let i=0;i< listOfZones.responsibleCounties.length; i++){
            const zoneFetch = await fetch(listOfZones.responsibleCounties[i]);
            const zone = await zoneFetch.json();
            console.log(`[${i}] ${zone.properties.name} (${zone.properties.name == this.county})`);
            
            if (zone.properties.name == this.county){
                countyCode = zone.properties.id;
            }
        }
        console.log(`Found zone ${countyCode} for ${this.county} County\n`);
        return countyCode;
    }

    private drawLineWithText(text, char = '=', maxChars = 10, _center = true) {
        const terminalWidth = process.stdout.columns - 1;
        const textLen = text.split('').length;
        const cols = (terminalWidth - textLen) / 2;
        let chars = '';
    
        for (let i = 0; i < cols; i++) {
            if (chars.length == maxChars) continue;
            chars += char;
        }
        console.log(chars + text + chars);
    }
}