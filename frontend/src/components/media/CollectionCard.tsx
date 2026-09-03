import { Layers } from 'lucide-react';

interface CollectionCardProps {
     
    collection: any;
    onClick?: () => void;
}

const CollectionCard = ({ collection, onClick }: CollectionCardProps) => {
    return (
        <div
            onClick={onClick}
            className="group cursor-pointer w-full h-full"
        >
            <div className="aspect-[2/3] rounded-lg overflow-hidden relative shadow-lg mb-2 border border-transparent group-hover:border-primary transition-all">
                <img
                    src={collection.poster_url || '/placeholder.png'}
                    alt={collection.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                     
                    onError={(e) => (e.target as any).src = '/placeholder.png'}
                />
                <div className="absolute top-2 right-2 bg-primary text-primary-foreground text-xs font-bold px-2 py-1 rounded shadow">
                    {collection.media_count} أفلام
                </div>
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Layers className="w-10 h-10 text-white" />
                </div>
            </div>
            <h3 className="font-bold text-center truncate px-1 text-sm md:text-base">{collection.name}</h3>
        </div>
    );
};

export default CollectionCard;


