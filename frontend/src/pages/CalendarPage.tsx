import Header from '@/components/layout/Header';
import ReleaseCalendar from '@/components/calendar/ReleaseCalendar';

const CalendarPage = () => {
    return (
        <div className="min-h-screen bg-background">
            <Header />
            <main className="w-full pt-20 container mx-auto">
                <ReleaseCalendar />
            </main>
        </div>
    );
};

export default CalendarPage;
